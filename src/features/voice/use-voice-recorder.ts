import { useCallback, useEffect, useRef, useState } from "react"

import type { SpeechError } from "./use-speech-recognition"

export type RecorderStatus = "idle" | "listening" | "transcribing"

interface Options {
  /** Token do usuário logado, enviado ao Worker de transcrição. */
  getAccessToken: () => Promise<string | null>
  onFinal: (text: string) => void
  onError?: (error: SpeechError) => void
  debug?: boolean
}

/** Volume (RMS) a partir do qual consideramos que há fala. */
const SPEECH_LEVEL = 0.02
/** Silêncio depois de alguma fala → encerra a gravação. */
const SILENCE_MS = 1500
/** Nenhuma fala detectada → desiste. */
const NO_SPEECH_MS = 7000
const MAX_MS = 30000

const MIME_TYPES = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg;codecs=opus"]

function pickMimeType() {
  if (typeof MediaRecorder === "undefined") return undefined
  return MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type))
}

function extensionFor(mimeType: string) {
  if (mimeType.includes("mp4")) return "m4a"
  if (mimeType.includes("ogg")) return "ogg"
  return "webm"
}

export function isRecorderSupported() {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== "undefined"
  )
}

/**
 * Grava o áudio no navegador e transcreve no servidor (/api/transcribe).
 * Funciona onde a Web Speech API falha (Safari/iOS, Firefox).
 * Expõe a mesma interface do useSpeechRecognition.
 */
export function useVoiceRecorder({ getAccessToken, onFinal, onError, debug = false }: Options) {
  const [status, setStatus] = useState<RecorderStatus>("idle")
  const [level, setLevel] = useState(0)
  const [log, setLog] = useState<string[]>([])
  const callbacks = useRef({ getAccessToken, onFinal, onError })
  useEffect(() => {
    callbacks.current = { getAccessToken, onFinal, onError }
  })

  const sessionRef = useRef(0)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const intervalRef = useRef<number | undefined>(undefined)
  const cancelledRef = useRef(false)

  const trace = useCallback(
    (message: string) => {
      if (!debug) return
      const time = new Date().toISOString().slice(11, 23)
      console.debug(`[voz] ${message}`)
      setLog((lines) => [...lines.slice(-29), `${time} ${message}`])
    },
    [debug]
  )

  /** Libera o microfone (o iOS só deixa gravar de novo depois disso). */
  const release = useCallback(() => {
    window.clearInterval(intervalRef.current)
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    // Um AudioContext novo por gravação: no iOS o antigo fica "interrupted" depois da primeira
    const audioContext = audioContextRef.current
    audioContextRef.current = null
    void audioContext?.close().catch(() => {})
    setLevel(0)
  }, [])

  const fail = useCallback(
    (session: number, error: SpeechError) => {
      if (session !== sessionRef.current) return
      trace(`erro: ${error}`)
      cancelledRef.current = true
      if (recorderRef.current?.state === "recording") recorderRef.current.stop()
      recorderRef.current = null
      release()
      setStatus("idle")
      callbacks.current.onError?.(error)
    },
    [release, trace]
  )

  const send = useCallback(
    async (session: number, blob: Blob, mimeType: string) => {
      setStatus("transcribing")
      trace(`enviando ${Math.round(blob.size / 1024)} KB (${mimeType})`)
      try {
        const token = await callbacks.current.getAccessToken()
        const body = new FormData()
        body.append("audio", new File([blob], `audio.${extensionFor(mimeType)}`, { type: mimeType }))
        const response = await fetch("/api/transcribe", {
          method: "POST",
          body,
          headers: token ? { authorization: `Bearer ${token}` } : undefined,
        })
        if (session !== sessionRef.current) return
        if (!response.ok) {
          trace(`servidor respondeu ${response.status}`)
          setStatus("idle")
          callbacks.current.onError?.(response.status === 401 ? "unauthorized" : "other")
          return
        }
        const { text } = (await response.json()) as { text: string }
        trace(`texto="${text}"`)
        setStatus("idle")
        if (text) callbacks.current.onFinal(text)
        else callbacks.current.onError?.("no-speech")
      } catch {
        if (session !== sessionRef.current) return
        setStatus("idle")
        callbacks.current.onError?.("network")
      }
    },
    [trace]
  )

  const start = useCallback(async () => {
    if (!isRecorderSupported()) {
      callbacks.current.onError?.("not-supported")
      return
    }
    const session = ++sessionRef.current
    cancelledRef.current = false
    setStatus("listening")
    trace("start()")

    // O AudioContext precisa ser criado/retomado dentro do toque (iOS)
    const AudioContextClass =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    void audioContextRef.current?.close().catch(() => {})
    const audioContext = new AudioContextClass()
    audioContextRef.current = audioContext
    void audioContext.resume()

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
    } catch (error) {
      const name = (error as Error).name
      fail(session, name === "NotAllowedError" || name === "SecurityError" ? "not-allowed" : "other")
      return
    }
    if (session !== sessionRef.current || cancelledRef.current) {
      stream.getTracks().forEach((track) => track.stop())
      return
    }
    streamRef.current = stream

    const mimeType = pickMimeType()
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
    recorderRef.current = recorder
    const chunks: Blob[] = []
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data)
    }
    recorder.onstop = () => {
      // Gravação antiga (cancelada/trocada): não derruba o microfone da nova
      if (session !== sessionRef.current) return
      release()
      recorderRef.current = null
      if (cancelledRef.current || session !== sessionRef.current) return
      const type = recorder.mimeType || mimeType || "audio/webm"
      void send(session, new Blob(chunks, { type }), type)
    }
    recorder.start(250)
    trace(`gravando (${recorder.mimeType || "formato padrão"})`)

    // Volume para a animação e para detectar o fim da fala
    const source = audioContext.createMediaStreamSource(stream)
    const analyser = audioContext.createAnalyser()
    analyser.fftSize = 1024
    source.connect(analyser)
    const samples = new Float32Array(analyser.fftSize)
    const startedAt = Date.now()
    let lastSpeechAt = 0

    intervalRef.current = window.setInterval(() => {
      analyser.getFloatTimeDomainData(samples)
      let sum = 0
      for (const sample of samples) sum += sample * sample
      const rms = Math.sqrt(sum / samples.length)
      setLevel(Math.min(1, rms / 0.15))

      const now = Date.now()
      if (rms > SPEECH_LEVEL) lastSpeechAt = now
      const stopRecording = (reason: string) => {
        trace(reason)
        window.clearInterval(intervalRef.current)
        if (recorder.state === "recording") recorder.stop()
      }
      // Se o contexto de áudio não está rodando o volume vem zerado: não dá para
      // concluir que "não houve fala"; a gravação segue até o toque ou o limite.
      if (!lastSpeechAt && now - startedAt > NO_SPEECH_MS && audioContext.state === "running") {
        fail(session, "no-speech")
      } else if (lastSpeechAt && now - lastSpeechAt > SILENCE_MS) {
        stopRecording("silêncio; encerrando")
      } else if (now - startedAt > MAX_MS) {
        stopRecording("tempo máximo; encerrando")
      }
    }, 100)
  }, [fail, release, send, trace])

  /** Para de gravar e transcreve. */
  const stop = useCallback(() => {
    trace("stop()")
    if (recorderRef.current?.state === "recording") recorderRef.current.stop()
  }, [trace])

  /** Para de gravar e descarta. */
  const cancel = useCallback(() => {
    trace("cancelado pelo usuário")
    cancelledRef.current = true
    sessionRef.current++
    if (recorderRef.current?.state === "recording") recorderRef.current.stop()
    recorderRef.current = null
    release()
    setStatus("idle")
  }, [release, trace])

  useEffect(
    () => () => {
      cancelledRef.current = true
      release()
    },
    [release]
  )

  return { supported: isRecorderSupported(), status, level, log, start, stop, cancel }
}
