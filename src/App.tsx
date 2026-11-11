import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { MoonIcon, SunIcon } from "lucide-react"
import { useTheme } from "next-themes"

import { Toaster } from "@/components/ui/sonner"
import { AccountButton } from "@/features/auth/components/account-button"
import { FilterChips, TaskList } from "@/features/tasks/components/task-list"
import { TaskFormSheet } from "@/features/tasks/components/task-form-sheet"
import { ComposerBar } from "@/features/voice/components/composer-bar"

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const isDark = resolvedTheme === "dark"
  return (
    <button
      type="button"
      aria-label={isDark ? "Usar tema claro" : "Usar tema escuro"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="flex size-11 items-center justify-center rounded-full border bg-card text-muted-foreground transition-colors hover:text-foreground"
    >
      {isDark ? <SunIcon className="size-5" /> : <MoonIcon className="size-5" />}
    </button>
  )
}

export default function App() {
  const today = format(new Date(), "EEEE, d 'de' MMMM", { locale: ptBR })

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 bg-background/85 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 px-4 pt-4 pb-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-[34px] leading-tight font-semibold tracking-tight">Tarefas</h1>
              <p className="text-sm text-muted-foreground first-letter:uppercase">{today}</p>
            </div>
            <div className="flex items-center gap-2">
              <AccountButton />
              <ThemeToggle />
            </div>
          </div>
          <FilterChips />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 pt-1 pb-28">
        <TaskList />
      </main>

      <ComposerBar />
      <TaskFormSheet />
      <Toaster position="top-center" />
    </div>
  )
}
