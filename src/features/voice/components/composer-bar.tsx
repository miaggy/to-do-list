import { AudioLinesIcon, PlusIcon, SquareIcon } from "lucide-react"
import { useEffect } from "react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"

import { useTaskUi } from "../../tasks/store"
import { parseTask } from "../parse-task"
import { useSpeechRecognition, type SpeechError } from "../use-speech-recognition"
import { ListeningPanel } from "./listening-panel"

const ERROR_MESSAGES: Record<SpeechError, string> = {
  "not-supported":
    "Seu navegador não suporta reconhecimento de voz. Use Chrome, Edge ou Safari.",
  "not-allowed": "Permita o acesso ao microfone para criar tarefas por voz.",
  "no-speech": "Não ouvi nada. Tente de novo.",
  network: "Sem conexão com o serviço de voz. Verifique a internet.",
  other: "Não foi possível usar o microfone agora.",
}

const barButton =
  "flex h-12 flex-1 items-center justify-center gap-2 rounded-full text-[15px] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 [&_svg]:size-5"

export function ComposerBar() {
  const openCreate = useTaskUi((s) => s.openCreate)

  const speech = useSpeechRecognition({
    onFinal: (spoken) => {
      const { draft } = parseTask(spoken)
      openCreate({ draft, source: "voice", transcript: spoken })
    },
    onError: (error) => toast.error(ERROR_MESSAGES[error]),
  })
  const listening = speech.status === "listening"

  // Atalho no desktop: "n" abre o formulário completo
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (target.closest("input, textarea, [contenteditable], [role=dialog]")) return
      if (e.key === "n") {
        e.preventDefault()
        openCreate()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [openCreate])

  /** Toca para falar; para sozinho no silêncio ou com outro toque. */
  function onVoiceToggle() {
    if (!speech.supported) {
      toast.error(ERROR_MESSAGES["not-supported"])
      return
    }
    if (listening) speech.stop()
    else speech.start(false)
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-2">
        {listening && (
          <ListeningPanel transcript={speech.transcript} onCancel={speech.cancel} />
        )}

        <div className="pointer-events-auto flex items-center gap-1.5 rounded-full border bg-card/90 p-1.5 shadow-lg shadow-black/10 backdrop-blur-xl">
          <button
            type="button"
            onClick={() => openCreate()}
            disabled={listening}
            className={cn(barButton, "bg-muted text-foreground hover:bg-muted/70")}
          >
            <PlusIcon />
            Nova tarefa
          </button>

          <button
            type="button"
            onClick={onVoiceToggle}
            className={cn(
              barButton,
              "bg-foreground text-background hover:bg-foreground/90",
              listening && "bg-brand text-white hover:bg-brand/90"
            )}
          >
            {listening ? (
              <>
                <SquareIcon className="fill-current !size-4" />
                Parar
              </>
            ) : (
              <>
                <AudioLinesIcon />
                Falar
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
