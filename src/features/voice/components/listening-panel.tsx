import { XIcon } from "lucide-react"

import { cn } from "@/lib/utils"

interface ListeningPanelProps {
  transcript: string
  mode: "hold" | "tap"
  willCancel: boolean
  onCancel: () => void
}

/** Painel acima da barra que mostra a transcrição ao vivo. */
export function ListeningPanel({ transcript, mode, willCancel, onCancel }: ListeningPanelProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "pointer-events-auto animate-in fade-in slide-in-from-bottom-2 rounded-3xl border bg-card/95 p-4 shadow-lg backdrop-blur-xl duration-200",
        willCancel && "opacity-60"
      )}
    >
      <div className="mb-2 flex items-center gap-3">
        <span className="flex h-5 items-center gap-[3px]" aria-hidden>
          {[0, 1, 2, 3, 4].map((i) => (
            <span
              key={i}
              className="w-[3px] animate-[voice-bar_0.9s_ease-in-out_infinite] rounded-full bg-brand"
              style={{ animationDelay: `${i * 0.12}s` }}
            />
          ))}
        </span>
        <span className="text-sm text-muted-foreground">
          {willCancel ? "Solte para cancelar" : "Ouvindo…"}
        </span>
        {mode === "tap" && (
          <button
            type="button"
            aria-label="Cancelar"
            onClick={onCancel}
            className="ml-auto rounded-full p-1 text-muted-foreground hover:text-foreground"
          >
            <XIcon className="size-4" />
          </button>
        )}
      </div>
      <p className={cn("min-h-6 text-[17px] leading-snug", !transcript && "text-muted-foreground")}>
        {transcript || "Diga a tarefa, a data e a prioridade…"}
      </p>
    </div>
  )
}
