import { LoaderCircleIcon, XIcon } from "lucide-react"

import { cn } from "@/lib/utils"

interface ListeningPanelProps {
  status: "listening" | "transcribing"
  transcript: string
  /** Volume do microfone (0–1) quando disponível; senão a onda é animada. */
  level: number | null
  onCancel: () => void
}

const BAR_WEIGHTS = [0.55, 0.8, 1, 0.8, 0.55]

/** Painel acima da barra: onda de áudio e transcrição ao vivo. */
export function ListeningPanel({ status, transcript, level, onCancel }: ListeningPanelProps) {
  const transcribing = status === "transcribing"
  const placeholder = transcribing
    ? "Transformando sua fala em tarefa…"
    : level !== null
      ? "Fale a tarefa, a data e a prioridade. Paro sozinho quando você terminar."
      : "Diga a tarefa, a data e a prioridade…"

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-auto animate-in fade-in slide-in-from-bottom-2 rounded-3xl border bg-card/95 p-4 shadow-lg backdrop-blur-xl duration-200"
    >
      <div className="mb-2 flex items-center gap-3">
        {transcribing ? (
          <LoaderCircleIcon className="size-5 animate-spin text-brand" aria-hidden />
        ) : (
          <span className="flex h-5 items-center gap-[3px]" aria-hidden>
            {BAR_WEIGHTS.map((weight, i) =>
              level === null ? (
                <span
                  key={i}
                  className="w-[3px] animate-[voice-bar_0.9s_ease-in-out_infinite] rounded-full bg-brand"
                  style={{ animationDelay: `${i * 0.12}s` }}
                />
              ) : (
                <span
                  key={i}
                  className="w-[3px] rounded-full bg-brand transition-[height] duration-100"
                  style={{ height: `${Math.max(20, Math.min(100, level * weight * 160))}%` }}
                />
              )
            )}
          </span>
        )}
        <span className="text-sm text-muted-foreground">
          {transcribing ? "Transcrevendo…" : "Ouvindo…"}
        </span>
        <button
          type="button"
          aria-label="Cancelar"
          onClick={onCancel}
          className="ml-auto rounded-full p-1 text-muted-foreground hover:text-foreground"
        >
          <XIcon className="size-4" />
        </button>
      </div>
      <p className={cn("min-h-6 text-[17px] leading-snug", !transcript && "text-muted-foreground")}>
        {transcript || placeholder}
      </p>
    </div>
  )
}
