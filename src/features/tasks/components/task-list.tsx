import { useLiveQuery } from "dexie-react-hooks"
import { ListTodoIcon } from "lucide-react"

import { cn } from "@/lib/utils"

import { db } from "../db"
import { FILTERS, groupTasks } from "../selectors"
import { useTaskUi } from "../store"
import { TaskItem } from "./task-item"

function greeting() {
  const hour = new Date().getHours()
  if (hour < 5) return "Boa noite"
  if (hour < 12) return "Bom dia"
  if (hour < 18) return "Boa tarde"
  return "Boa noite"
}

const EMPTY_MESSAGES = {
  all: "Nenhuma tarefa pendente.",
  today: "Nada para hoje.",
  upcoming: "Nada agendado para os próximos dias.",
  done: "Nenhuma tarefa concluída ainda.",
}

export function FilterChips() {
  const filter = useTaskUi((s) => s.filter)
  const setFilter = useTaskUi((s) => s.setFilter)
  return (
    <div
      role="tablist"
      className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]"
    >
      {FILTERS.map((f) => (
        <button
          key={f.value}
          role="tab"
          aria-selected={filter === f.value}
          onClick={() => setFilter(f.value)}
          className={cn(
            "shrink-0 rounded-full border px-3.5 py-1.5 text-sm transition-colors",
            filter === f.value
              ? "border-foreground bg-foreground text-background"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {f.label}
        </button>
      ))}
    </div>
  )
}

export function TaskList() {
  const filter = useTaskUi((s) => s.filter)
  const tasks = useLiveQuery(() => db.tasks.toArray(), [])

  if (!tasks) return null

  if (tasks.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <ListTodoIcon className="size-10 text-brand" aria-hidden />
        <h2 className="font-serif text-3xl tracking-tight">{greeting()}</h2>
        <p className="max-w-xs text-sm text-muted-foreground">
          Segure o microfone e diga algo como{" "}
          <span className="text-foreground">
            “Pagar a conta de luz amanhã às 10, prioridade alta”
          </span>
          .
        </p>
      </div>
    )
  }

  const groups = groupTasks(tasks, filter)

  if (groups.length === 0) {
    return (
      <p className="py-16 text-center text-sm text-muted-foreground">
        {EMPTY_MESSAGES[filter]}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {groups.map((group) => (
        <section key={group.key} aria-labelledby={`group-${group.key}`}>
          <h2
            id={`group-${group.key}`}
            className={cn(
              "mb-1 flex items-baseline gap-2 px-3 text-xs font-medium tracking-wide text-muted-foreground uppercase",
              group.key === "overdue" && "text-destructive"
            )}
          >
            {group.label}
            <span className="tabular-nums opacity-70">{group.tasks.length}</span>
          </h2>
          <ul className="flex flex-col">
            {group.tasks.map((task) => (
              <TaskItem key={task.id} task={task} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
