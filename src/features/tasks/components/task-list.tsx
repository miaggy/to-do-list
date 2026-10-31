import { useLiveQuery } from "dexie-react-hooks"
import { ArrowDownWideNarrowIcon, ListTodoIcon } from "lucide-react"

import { cn } from "@/lib/utils"

import { db } from "../db"
import {
  FILTERS,
  PRIORITY_FILTERS,
  groupTasks,
  groupTasksByPriority,
} from "../selectors"
import { useTaskUi } from "../store"
import { PRIORITY_META } from "../types"
import { PriorityDot } from "./priority-badge"
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

const chipClass = (selected: boolean) =>
  cn(
    "flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm transition-colors",
    selected
      ? "border-foreground bg-foreground text-background"
      : "text-muted-foreground hover:text-foreground"
  )

export function FilterChips() {
  const view = useTaskUi((s) => s.view)
  const setView = useTaskUi((s) => s.setView)
  const filter = useTaskUi((s) => s.filter)
  const setFilter = useTaskUi((s) => s.setFilter)
  const priorityFilter = useTaskUi((s) => s.priorityFilter)
  const setPriorityFilter = useTaskUi((s) => s.setPriorityFilter)
  const byPriority = view === "priority"

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        aria-pressed={byPriority}
        aria-label="Ordenar por prioridade"
        title="Ordenar por prioridade"
        onClick={() => setView(byPriority ? "date" : "priority")}
        className={cn(
          "flex size-[34px] shrink-0 items-center justify-center rounded-full border transition-colors",
          byPriority
            ? "border-brand bg-brand/10 text-brand"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        <ArrowDownWideNarrowIcon className="size-4" />
      </button>
      <div
        role="tablist"
        className="-mr-4 flex min-w-0 flex-1 gap-2 overflow-x-auto pr-4 [scrollbar-width:none]"
      >
        {byPriority
          ? PRIORITY_FILTERS.map((f) => (
              <button
                key={f.value}
                role="tab"
                aria-selected={priorityFilter === f.value}
                onClick={() => setPriorityFilter(f.value)}
                className={chipClass(priorityFilter === f.value)}
              >
                {f.value !== "all" && <PriorityDot priority={f.value} />}
                {f.label}
              </button>
            ))
          : FILTERS.map((f) => (
              <button
                key={f.value}
                role="tab"
                aria-selected={filter === f.value}
                onClick={() => setFilter(f.value)}
                className={chipClass(filter === f.value)}
              >
                {f.label}
              </button>
            ))}
      </div>
    </div>
  )
}

export function TaskList() {
  const view = useTaskUi((s) => s.view)
  const filter = useTaskUi((s) => s.filter)
  const priorityFilter = useTaskUi((s) => s.priorityFilter)
  const tasks = useLiveQuery(
    () => db.tasks.filter((task) => !task.deletedAt).toArray(),
    []
  )

  if (!tasks) return null

  if (tasks.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <ListTodoIcon className="size-10 text-brand" aria-hidden />
        <h2 className="font-serif text-3xl tracking-tight">{greeting()}</h2>
        <p className="max-w-xs text-sm text-muted-foreground">
          Toque no botão de áudio e diga algo como{" "}
          <span className="text-foreground">
            “Pagar a conta de luz amanhã às 10, prioridade alta”
          </span>
          .
        </p>
      </div>
    )
  }

  const byPriority = view === "priority"
  const groups = byPriority
    ? groupTasksByPriority(tasks, priorityFilter)
    : groupTasks(tasks, filter)

  if (groups.length === 0) {
    const message = !byPriority
      ? EMPTY_MESSAGES[filter]
      : priorityFilter === "all"
        ? EMPTY_MESSAGES.all
        : `Nenhuma tarefa pendente com prioridade ${PRIORITY_META[priorityFilter].label.toLowerCase()}.`
    return <p className="py-16 text-center text-sm text-muted-foreground">{message}</p>
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
            {group.priority && <PriorityDot priority={group.priority} className="self-center" />}
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
