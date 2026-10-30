import {
  ArrowUpIcon,
  AudioLinesIcon,
  KeyboardIcon,
  MicIcon,
  PlusIcon,
  SquareIcon,
} from "lucide-react"
import { useEffect, useRef, useState, type PointerEvent } from "react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { useMediaQuery } from "@/hooks/use-media-query"

import { createTask } from "../../tasks/repository"
import { useTaskUi } from "../../tasks/store"
import { parseTask } from "../parse-task"
import { useSpeechRecognition, type SpeechError } from "../use-speech-recognition"
import { ListeningPanel } from "./listening-panel"

type InputMode = "voice" | "text"
type ListenMode = "hold" | "tap"

const MODE_KEY = "composer-mode"
const HOLD_MIN_MS = 350

const ERROR_MESSAGES: Record<SpeechError, string> = {
  "not-supported":
    "Seu navegador não suporta reconhecimento de voz. Use Chrome, Edge ou Safari.",
  "not-allowed": "Permita o acesso ao microfone para criar tarefas por voz.",
  "no-speech": "Não ouvi nada. Tente de novo.",
  network: "Sem conexão com o serviço de voz. Verifique a internet.",
  other: "Não foi possível usar o microfone agora.",
}

function readStoredMode(): InputMode | null {
  try {
    const value = localStorage.getItem(MODE_KEY)
    return value === "voice" || value === "text" ? value : null
  } catch {
    return null
  }
}

const circleButton =
  "flex size-12 shrink-0 items-center justify-center rounded-full transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-5"

export function ComposerBar() {
  const openCreate = useTaskUi((s) => s.openCreate)
  const openEdit = useTaskUi((s) => s.openEdit)
  const isDesktop = useMediaQuery("(min-width: 768px)")

  const [listenMode, setListenMode] = useState<ListenMode>("hold")
  const [willCancel, setWillCancel] = useState(false)
  const [text, setText] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)
  const holdStartRef = useRef(0)

  const speech = useSpeechRecognition({
    onFinal: (spoken) => {
      const { draft } = parseTask(spoken)
      openCreate({ draft, source: "voice", transcript: spoken })
    },
    onError: (error) => toast.error(ERROR_MESSAGES[error]),
  })

  const [mode, setModeState] = useState<InputMode>(
    () => readStoredMode() ?? (isDesktop || !speech.supported ? "text" : "voice")
  )
  const listening = speech.status === "listening"

  function setMode(next: InputMode) {
    setModeState(next)
    try {
      localStorage.setItem(MODE_KEY, next)
    } catch {
      // modo preferido é só uma conveniência
    }
    if (next === "text") requestAnimationFrame(() => inputRef.current?.focus())
  }

  // Atalhos no desktop: "/" digita, "n" abre o formulário completo
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (target.closest("input, textarea, [contenteditable], [role=dialog]")) return
      if (e.key === "/") {
        e.preventDefault()
        setMode("text")
      } else if (e.key === "n") {
        e.preventDefault()
        openCreate()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [openCreate])

  /* ---- Segurar para falar ---- */
  function isInside(e: PointerEvent<HTMLElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    return (
      e.clientX >= rect.left - 24 &&
      e.clientX <= rect.right + 24 &&
      e.clientY >= rect.top - 48 &&
      e.clientY <= rect.bottom + 24
    )
  }

  function onHoldStart(e: PointerEvent<HTMLButtonElement>) {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    holdStartRef.current = Date.now()
    setListenMode("hold")
    setWillCancel(false)
    speech.start(true)
  }

  function onHoldMove(e: PointerEvent<HTMLButtonElement>) {
    if (listening && listenMode === "hold") setWillCancel(!isInside(e))
  }

  function onHoldEnd(e: PointerEvent<HTMLButtonElement>) {
    if (listenMode !== "hold" || !listening) return
    const tooShort = Date.now() - holdStartRef.current < HOLD_MIN_MS
    if (!isInside(e) || tooShort) {
      speech.cancel()
      if (tooShort) toast("Segure o botão enquanto fala")
    } else {
      speech.stop()
    }
    setWillCancel(false)
  }

  /* ---- Tocar para falar (para sozinho no silêncio) ---- */
  function onTapToggle() {
    if (!speech.supported) {
      toast.error(ERROR_MESSAGES["not-supported"])
      return
    }
    if (listening) {
      speech.stop()
      return
    }
    holdStartRef.current = 0
    setListenMode("tap")
    speech.start(false)
  }

  /* ---- Texto ---- */
  async function submitText() {
    const value = text.trim()
    if (!value) return
    setText("")
    const { draft } = parseTask(value)
    const task = await createTask(draft, "text")
    toast.success("Tarefa criada", {
      description: task.title,
      action: { label: "Editar", onClick: () => openEdit(task) },
    })
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-2">
        {listening && (
          <ListeningPanel
            transcript={speech.transcript}
            mode={listenMode}
            willCancel={willCancel}
            onCancel={speech.cancel}
          />
        )}

        <div className="pointer-events-auto flex items-center gap-2 rounded-full border bg-card/90 p-1.5 shadow-lg shadow-black/10 backdrop-blur-xl">
          <button
            type="button"
            aria-label="Nova tarefa (formulário)"
            onClick={() => openCreate()}
            disabled={listening}
            className={cn(circleButton, "bg-muted text-foreground hover:bg-muted/70")}
          >
            <PlusIcon />
          </button>

          {mode === "voice" ? (
            <button
              type="button"
              aria-label="Segure para falar"
              onPointerDown={onHoldStart}
              onPointerMove={onHoldMove}
              onPointerUp={onHoldEnd}
              onPointerCancel={() => speech.cancel()}
              onContextMenu={(e) => e.preventDefault()}
              disabled={listening && listenMode === "tap"}
              className={cn(
                "flex h-12 min-w-0 flex-1 touch-none items-center justify-center gap-2 rounded-full bg-muted text-[15px] font-medium select-none [-webkit-touch-callout:none] transition-all",
                listening && listenMode === "hold" && "scale-[0.98] bg-foreground text-background",
                willCancel && "bg-destructive text-white"
              )}
            >
              <MicIcon className="size-5" />
              {listening && listenMode === "hold"
                ? willCancel
                  ? "Solte para cancelar"
                  : "Solte para criar"
                : "Segure para falar"}
            </button>
          ) : (
            <form
              className="flex min-w-0 flex-1"
              onSubmit={(e) => {
                e.preventDefault()
                submitText()
              }}
            >
              <input
                ref={inputRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && e.currentTarget.blur()}
                placeholder="Ex.: Pagar a luz amanhã às 10, prioridade alta"
                aria-label="Descreva a tarefa"
                enterKeyHint="send"
                autoComplete="off"
                className="h-12 w-full min-w-0 rounded-full bg-transparent px-3 text-[16px] outline-none placeholder:text-muted-foreground"
              />
            </form>
          )}

          <button
            type="button"
            aria-label={mode === "voice" ? "Digitar tarefa" : "Falar tarefa"}
            onClick={() => setMode(mode === "voice" ? "text" : "voice")}
            disabled={listening}
            className={cn(circleButton, "text-muted-foreground hover:text-foreground")}
          >
            {mode === "voice" ? <KeyboardIcon /> : <MicIcon />}
          </button>

          {mode === "text" && text.trim() ? (
            <button
              type="button"
              aria-label="Criar tarefa"
              onClick={submitText}
              className={cn(circleButton, "bg-foreground text-background hover:bg-foreground/90")}
            >
              <ArrowUpIcon />
            </button>
          ) : (
            <button
              type="button"
              aria-label={listening && listenMode === "tap" ? "Parar de ouvir" : "Tocar para falar"}
              onClick={onTapToggle}
              disabled={listening && listenMode === "hold"}
              className={cn(
                circleButton,
                "bg-foreground text-background hover:bg-foreground/90",
                listening && listenMode === "tap" && "bg-brand text-white hover:bg-brand/90"
              )}
            >
              {listening && listenMode === "tap" ? (
                <SquareIcon className="fill-current !size-4" />
              ) : (
                <AudioLinesIcon />
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
