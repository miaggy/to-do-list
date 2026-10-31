import { useEffect, useState } from "react"

import { getAccessToken } from "@/lib/supabase"

import { useSpeechRecognition, type SpeechError } from "./use-speech-recognition"
import { isRecorderSupported, useVoiceRecorder } from "./use-voice-recorder"

export type VoiceEngine = "browser" | "server"

const params = new URLSearchParams(window.location.search)
// ?debug=voz mostra os eventos na tela; ?voz=servidor|navegador força o motor
const DEBUG = params.get("debug") === "voz"
const FORCED = params.get("voz")

/** O reconhecimento do WebKit no iOS só funciona na primeira vez. */
function isIOS() {
  const ua = navigator.userAgent
  return /iP(hone|ad|od)/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
}

let healthPromise: Promise<boolean> | null = null
function serverTranscribeAvailable() {
  healthPromise ??= fetch("/api/health")
    .then((r) => (r.ok ? r.json() : { transcribe: false }))
    .then((body: { transcribe?: boolean }) => !!body.transcribe)
    .catch(() => false)
  return healthPromise
}

interface Options {
  onFinal: (text: string) => void
  onError: (error: SpeechError) => void
}

/**
 * Escolhe como transformar fala em texto:
 * - "server": grava o áudio e transcreve no Worker (iOS, Firefox);
 * - "browser": Web Speech API, com texto ao vivo (Chrome/Edge no desktop e Android).
 */
export function useVoiceInput(options: Options) {
  const browser = useSpeechRecognition({ ...options, debug: DEBUG })
  const server = useVoiceRecorder({ ...options, getAccessToken, debug: DEBUG })
  const [serverReady, setServerReady] = useState(false)

  useEffect(() => {
    let active = true
    void serverTranscribeAvailable().then((ok) => active && setServerReady(ok))
    return () => {
      active = false
    }
  }, [])

  const preferServer = FORCED === "servidor" || isIOS() || !browser.supported
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
