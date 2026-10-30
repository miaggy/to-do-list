import { useCallback, useEffect, useRef, useState } from "react"

/* Tipos mínimos da Web Speech API (ainda não fazem parte do lib DOM). */
interface SpeechRecognitionAlternative {
  transcript: string
}
interface SpeechRecognitionResult {
  readonly isFinal: boolean
  readonly length: number
  [index: number]: SpeechRecognitionAlternative
}
interface SpeechRecognitionEvent extends Event {
  readonly results: { readonly length: number; [index: number]: SpeechRecognitionResult }
}
interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string
}
interface SpeechRecognitionInstance extends EventTarget {
  lang: string
  continuous: boolean
  interimResults: boolean
  start(): void
  stop(): void
  abort(): void
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
}
type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance

function getRecognitionClass(): SpeechRecognitionConstructor | undefined {
  if (typeof window === "undefined") return undefined
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor
    webkitSpeechRecognition?: SpeechRecognitionConstructor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition
}

export type SpeechStatus = "idle" | "listening"

export type SpeechError = "not-supported" | "not-allowed" | "no-speech" | "network" | "other"

interface Options {
  lang?: string
  /** Chamado com o texto final quando a escuta termina (e não foi cancelada). */
  onFinal: (text: string) => void
  onError?: (error: SpeechError) => void
}

/**
 * Adaptador da Web Speech API. A UI só conhece start/stop/cancel, então no app
 * nativo dá para trocar por um plugin (ex.: Capacitor) mantendo a mesma interface.
 */
export function useSpeechRecognition({ lang = "pt-BR", onFinal, onError }: Options) {
  const [status, setStatus] = useState<SpeechStatus>("idle")
  const [transcript, setTranscript] = useState("")
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)
  const cancelledRef = useRef(false)
  const textRef = useRef("")
  const callbacks = useRef({ onFinal, onError })
  useEffect(() => {
    callbacks.current = { onFinal, onError }
  })

  const supported = !!getRecognitionClass()

  const start = useCallback(
    (continuous: boolean) => {
      const Recognition = getRecognitionClass()
      if (!Recognition) {
        callbacks.current.onError?.("not-supported")
        return
      }
      recognitionRef.current?.abort()

      const recognition = new Recognition()
      recognition.lang = lang
      recognition.continuous = continuous
      recognition.interimResults = true
      cancelledRef.current = false
      textRef.current = ""
      setTranscript("")

      recognition.onresult = (event) => {
        let text = ""
        for (let i = 0; i < event.results.length; i++) {
          text += event.results[i][0].transcript
        }
        textRef.current = text.trim()
        setTranscript(textRef.current)
      }
      recognition.onerror = (event) => {
        if (event.error === "aborted") return
        const error: SpeechError =
          event.error === "not-allowed" || event.error === "service-not-allowed"
            ? "not-allowed"
            : event.error === "no-speech"
              ? "no-speech"
              : event.error === "network"
                ? "network"
                : "other"
        cancelledRef.current = true
        callbacks.current.onError?.(error)
      }
      recognition.onend = () => {
        recognitionRef.current = null
        setStatus("idle")
        const text = textRef.current
        if (cancelledRef.current) return
        if (text) callbacks.current.onFinal(text)
        else callbacks.current.onError?.("no-speech")
      }

      recognitionRef.current = recognition
      setStatus("listening")
      try {
        recognition.start()
      } catch {
        recognitionRef.current = null
        setStatus("idle")
        callbacks.current.onError?.("other")
      }
    },
    [lang]
  )

  /** Para de ouvir e entrega o que foi reconhecido. */
  const stop = useCallback(() => recognitionRef.current?.stop(), [])

  /** Para de ouvir e descarta o texto. */
  const cancel = useCallback(() => {
    cancelledRef.current = true
    recognitionRef.current?.abort()
    setStatus("idle")
  }, [])

  useEffect(() => () => recognitionRef.current?.abort(), [])

  return { supported, status, transcript, start, stop, cancel }
}
