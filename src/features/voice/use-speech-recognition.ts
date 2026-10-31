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

export type SpeechError =
  | "not-supported"
  | "not-allowed"
  | "no-speech"
  | "network"
  | "unauthorized"
  | "other"

interface Options {
  lang?: string
  /** Chamado com o texto final quando a escuta termina (e não foi cancelada). */
  onFinal: (text: string) => void
  onError?: (error: SpeechError) => void
  /** Registra os eventos do reconhecimento para diagnóstico. */
  debug?: boolean
}

/** Sem nenhum resultado depois de começar → desiste (o iOS às vezes trava aqui). */
const NO_RESULT_MS = 7000
/** Silêncio depois do último resultado → encerra sem depender do navegador. */
const SILENCE_MS = 1800
/** Tempo para o navegador confirmar o fim depois de stop() antes de forçar. */
const END_GRACE_MS = 1500
const MAX_MS = 30000

function mapError(error: string): SpeechError {
  if (error === "not-allowed" || error === "service-not-allowed") return "not-allowed"
  if (error === "no-speech") return "no-speech"
  if (error === "network") return "network"
  return "other"
}

/**
 * Junta os resultados. No iOS em modo contínuo o último resultado às vezes já
 * traz a frase inteira acumulada; nesse caso usa só ele para não duplicar.
 */
function joinResults(results: SpeechRecognitionEvent["results"]) {
  const parts: string[] = []
  for (let i = 0; i < results.length; i++) parts.push(results[i][0].transcript.trim())
  const last = parts.at(-1) ?? ""
  const before = parts.slice(0, -1).join(" ").trim()
  if (before && last.startsWith(before)) return last
  return parts.filter(Boolean).join(" ")
}

/**
 * Adaptador da Web Speech API. A UI só conhece start/stop/cancel, então no app
 * nativo dá para trocar por um plugin (ex.: Capacitor) mantendo a mesma interface.
 *
 * O Safari/WebKit no iOS é instável: depois da primeira escuta pode parar de
 * entregar resultados e nunca disparar "end". Por isso o fim da escuta é
 * controlado aqui por timers, e uma instância que travou é descartada.
 */
export function useSpeechRecognition({ lang = "pt-BR", onFinal, onError, debug = false }: Options) {
  const [status, setStatus] = useState<SpeechStatus>("idle")
  const [transcript, setTranscript] = useState("")
  const [log, setLog] = useState<string[]>([])
  const instanceRef = useRef<SpeechRecognitionInstance | null>(null)
  const sessionRef = useRef(0)
  const activeRef = useRef(false)
  const textRef = useRef("")
  const timers = useRef<{ noResult?: number; silence?: number; grace?: number; max?: number }>({})
  const callbacks = useRef({ onFinal, onError })
  useEffect(() => {
    callbacks.current = { onFinal, onError }
  })

  const supported = !!getRecognitionClass()

  const trace = useCallback(
    (message: string) => {
      if (!debug) return
      const time = new Date().toISOString().slice(11, 23)
      console.debug(`[voz] ${message}`)
      setLog((lines) => [...lines.slice(-29), `${time} ${message}`])
    },
    [debug]
  )

  const clearTimers = useCallback(() => {
    for (const id of Object.values(timers.current)) window.clearTimeout(id)
    timers.current = {}
  }, [])

  /** Joga fora a instância atual (ex.: travou) para a próxima ser nova. */
  const discardInstance = useCallback(() => {
    const instance = instanceRef.current
    instanceRef.current = null
    if (!instance) return
    instance.onresult = instance.onerror = instance.onend = null
    try {
      instance.abort()
    } catch {
      // já parada
    }
  }, [])

  /** Encerra a sessão uma única vez, entregando o texto ou o erro. */
  const finish = useCallback(
    (session: number, outcome: { deliver: boolean; error?: SpeechError; discard?: boolean }) => {
      if (session !== sessionRef.current || !activeRef.current) return
      activeRef.current = false
      clearTimers()
      if (outcome.discard) discardInstance()
      setStatus("idle")
      const text = textRef.current
      trace(`fim: ${outcome.error ?? (outcome.deliver ? `texto="${text}"` : "cancelado")}`)
      if (outcome.error) callbacks.current.onError?.(outcome.error)
      else if (outcome.deliver) {
        if (text) callbacks.current.onFinal(text)
        else callbacks.current.onError?.("no-speech")
      }
    },
    [clearTimers, discardInstance, trace]
  )

  /** Pede ao navegador para parar e força o fim se ele não responder. */
  const requestStop = useCallback(
    (session: number) => {
      if (session !== sessionRef.current || !activeRef.current) return
      window.clearTimeout(timers.current.silence)
      trace("stop()")
      try {
        instanceRef.current?.stop()
      } catch {
        // ignora; o timer abaixo garante o fim
      }
      timers.current.grace = window.setTimeout(() => {
        trace("navegador não confirmou o fim; forçando")
        finish(session, { deliver: true, discard: true })
      }, END_GRACE_MS)
    },
    [finish, trace]
  )

  const start = useCallback(() => {
    const Recognition = getRecognitionClass()
    if (!Recognition) {
      callbacks.current.onError?.("not-supported")
      return
    }
    if (activeRef.current) finish(sessionRef.current, { deliver: false, discard: true })

    const session = ++sessionRef.current
    activeRef.current = true
    textRef.current = ""
    setTranscript("")
    setStatus("listening")

    const attach = (instance: SpeechRecognitionInstance) => {
      instance.lang = lang
      instance.continuous = true
      instance.interimResults = true
      instance.onresult = (event) => {
        if (session !== sessionRef.current) return
        const text = joinResults(event.results)
        trace(`resultado: "${text}"`)
        textRef.current = text
        setTranscript(text)
        window.clearTimeout(timers.current.noResult)
        window.clearTimeout(timers.current.silence)
        timers.current.silence = window.setTimeout(() => requestStop(session), SILENCE_MS)
      }
      instance.onerror = (event) => {
        trace(`erro: ${event.error}`)
        if (event.error === "aborted" || session !== sessionRef.current) return
        // "no-speech" com algum texto já reconhecido: entrega o que tem
        if (event.error === "no-speech" && textRef.current) {
          finish(session, { deliver: true })
          return
        }
        finish(session, { deliver: false, error: mapError(event.error), discard: true })
      }
      instance.onend = () => {
        trace("end")
        finish(session, { deliver: true })
      }
    }

    // Reaproveita a instância (o iOS lida melhor com uma só); se ela recusar, cria outra.
    let instance = instanceRef.current ?? new Recognition()
    instanceRef.current = instance
    attach(instance)
    try {
      trace("start()")
      instance.start()
    } catch (error) {
      trace(`start falhou (${(error as Error).name}); nova instância`)
      discardInstance()
      instance = new Recognition()
      instanceRef.current = instance
      attach(instance)
      try {
        instance.start()
      } catch {
        finish(session, { deliver: false, error: "other", discard: true })
        return
      }
    }

    timers.current.noResult = window.setTimeout(() => {
      trace("nenhum resultado; desistindo")
      finish(session, { deliver: false, error: "no-speech", discard: true })
    }, NO_RESULT_MS)
    timers.current.max = window.setTimeout(() => requestStop(session), MAX_MS)
  }, [discardInstance, finish, lang, requestStop, trace])

  /** Para de ouvir e entrega o que foi reconhecido. */
  const stop = useCallback(() => requestStop(sessionRef.current), [requestStop])

  /** Para de ouvir e descarta o texto. */
  const cancel = useCallback(() => {
    trace("cancelado pelo usuário")
    finish(sessionRef.current, { deliver: false, discard: true })
  }, [finish, trace])

  useEffect(
    () => () => {
      clearTimers()
      discardInstance()
    },
    [clearTimers, discardInstance]
  )

  return { supported, status, transcript, log, start, stop, cancel }
}
