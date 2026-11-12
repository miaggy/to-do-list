import { useEffect, useState } from "react"

import { getAccessToken } from "@/lib/supabase"

import { useSpeechRecognition, type SpeechError } from "./use-speech-recognition"
import { isRecorderSupported, useVoiceRecorder } from "./use-voice-recorder"

export type VoiceEngine = "browser" | "server"

const params = new URLSearchParams(window.location.search)
// ?debug=voz mostra os eventos na tela; ?voz=servidor|navegador força o motor
const DEBUG = params.get("debug") === "voz"
const FORCED = params.get("voz")

/**
 * O reconhecimento de voz do WebKit só funciona na primeira vez. Isso vale para
 * todo navegador no iOS (todos usam WebKit) e para o Safari no Mac.
 */
function isWebKitSpeech() {
  const ua = navigator.userAgent
  const ios = /iP(hone|ad|od)/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  const desktopSafari = /Safari\//.test(ua) && !/Chrome|Chromium|Edg|OPR|Android/.test(ua)
  return ios || desktopSafari
}

let healthPromise: Promise<boolean> | null = null
/** Só guarda a resposta do servidor: falha de rede não pode travar o motor "server". */
function serverTranscribeAvailable() {
  healthPromise ??= fetch("/api/health")
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((body: { transcribe?: boolean }) => !!body.transcribe)
    .catch(() => {
      healthPromise = null
      return false
    })
  return healthPromise
}

interface Options {
  onFinal: (text: string) => void
  onError: (error: SpeechError) => void
}

/**
 * Escolhe como transformar fala em texto:
 * - "server": grava o áudio e transcreve no Worker (iOS, Safari, Firefox);
 * - "browser": Web Speech API, com texto ao vivo (Chrome/Edge no desktop e Android).
 */
export function useVoiceInput(options: Options) {
  const browser = useSpeechRecognition({ ...options, debug: DEBUG })
  const server = useVoiceRecorder({ ...options, getAccessToken, debug: DEBUG })
  const [serverReady, setServerReady] = useState(false)

  useEffect(() => {
    let active = true
    const check = () => {
      void serverTranscribeAvailable().then((ok) => active && setServerReady(ok))
    }
    check()
    // Se a checagem falhou (rede, app voltando do segundo plano), tenta de novo
    const onWake = () => document.visibilityState !== "hidden" && check()
    window.addEventListener("online", check)
    document.addEventListener("visibilitychange", onWake)
    return () => {
      active = false
      window.removeEventListener("online", check)
      document.removeEventListener("visibilitychange", onWake)
    }
  }, [])

  const preferServer = FORCED === "servidor" || isWebKitSpeech() || !browser.supported
  const engine: VoiceEngine =
    FORCED === "navegador"
      ? "browser"
      : serverReady && isRecorderSupported() && preferServer
        ? "server"
        : "browser"

  const active = engine === "server" ? server : browser
  return {
    engine,
    debug: DEBUG,
    supported: active.supported,
    status: active.status as "idle" | "listening" | "transcribing",
    transcript: engine === "browser" ? browser.transcript : "",
    level: engine === "server" ? server.level : null,
    log: active.log,
    start: () => void active.start(),
    stop: active.stop,
    cancel: active.cancel,
  }
}
