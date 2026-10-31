import {
  addDays,
  format,
  isBefore,
  isSameYear,
  parseISO,
  startOfDay,
} from "date-fns"
import { ptBR } from "date-fns/locale"

import { PRIORITIES, PRIORITY_META, type Priority, type Task } from "./types"

export type TaskFilter = "all" | "today" | "upcoming" | "done"

export const FILTERS: { value: TaskFilter; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "today", label: "Hoje" },
  { value: "upcoming", label: "Próximas" },
  { value: "done", label: "Concluídas" },
]

export type ViewMode = "date" | "priority"

export type PriorityFilter = "all" | Exclude<Priority, "none">

export const PRIORITY_FILTERS: { value: PriorityFilter; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "urgent", label: "Urgente" },
  { value: "high", label: "Alta" },
  { value: "medium", label: "Média" },
  { value: "low", label: "Baixa" },
]

export function toDateKey(date: Date) {
  return format(date, "yyyy-MM-dd")
}

function todayKey() {
  return toDateKey(new Date())
}

export function isOverdue(task: Task) {
  if (task.completed || !task.dueDate) return false
  if (task.dueDate < todayKey()) return true
  if (task.dueDate === todayKey() && task.dueTime) {
    return isBefore(parseISO(`${task.dueDate}T${task.dueTime}`), new Date())
  }
  return false
}

export function formatDue(task: Pick<Task, "dueDate" | "dueTime">) {
  if (!task.dueDate) return null
  const date = parseISO(task.dueDate)
  const today = startOfDay(new Date())
  let label: string
  if (task.dueDate === toDateKey(today)) label = "Hoje"
  else if (task.dueDate === toDateKey(addDays(today, 1))) label = "Amanhã"
  else if (task.dueDate === toDateKey(addDays(today, -1))) label = "Ontem"
  else if (isBefore(date, addDays(today, 7)) && !isBefore(date, today))
    label = format(date, "EEEE", { locale: ptBR })
  else
    label = format(date, isSameYear(date, today) ? "d MMM" : "d MMM yyyy", {
      locale: ptBR,
    })
  label = label.charAt(0).toUpperCase() + label.slice(1)
  return task.dueTime ? `${label}, ${task.dueTime}` : label
}

function compareTasks(a: Task, b: Task) {
  const byPriority = PRIORITY_META[b.priority].rank - PRIORITY_META[a.priority].rank
  if (byPriority !== 0) return byPriority
  const aDue = a.dueDate ? `${a.dueDate}T${a.dueTime ?? "99:99"}` : "~"
  const bDue = b.dueDate ? `${b.dueDate}T${b.dueTime ?? "99:99"}` : "~"
  if (aDue !== bDue) return aDue < bDue ? -1 : 1
  return a.createdAt < b.createdAt ? -1 : 1
}

export interface TaskGroup {
  key: string
  label: string
  /** Só nos grupos do modo prioridade. */
  priority?: Priority
  tasks: Task[]
}

export function groupTasks(tasks: Task[], filter: TaskFilter): TaskGroup[] {
  if (filter === "done") {
    const done = tasks
      .filter((t) => t.completed)
      .sort((a, b) => ((a.completedAt ?? "") < (b.completedAt ?? "") ? 1 : -1))
    return done.length ? [{ key: "done", label: "Concluídas", tasks: done }] : []
  }

  const today = todayKey()
  const tomorrow = toDateKey(addDays(new Date(), 1))
  const buckets: Record<string, TaskGroup> = {
    overdue: { key: "overdue", label: "Atrasadas", tasks: [] },
    today: { key: "today", label: "Hoje", tasks: [] },
    tomorrow: { key: "tomorrow", label: "Amanhã", tasks: [] },
    later: { key: "later", label: "Próximas", tasks: [] },
    someday: { key: "someday", label: "Sem data", tasks: [] },
  }

  for (const task of tasks) {
    if (task.completed) continue
    if (isOverdue(task)) buckets.overdue.tasks.push(task)
    else if (!task.dueDate) buckets.someday.tasks.push(task)
    else if (task.dueDate === today) buckets.today.tasks.push(task)
    else if (task.dueDate === tomorrow) buckets.tomorrow.tasks.push(task)
    else buckets.later.tasks.push(task)
  }

  const keys =
    filter === "today"
      ? ["overdue", "today"]
      : filter === "upcoming"
        ? ["tomorrow", "later"]
        : ["overdue", "today", "tomorrow", "later", "someday"]

  return keys
    .map((key) => buckets[key])
    .filter((group) => group.tasks.length > 0)
    .map((group) => ({ ...group, tasks: group.tasks.sort(compareTasks) }))
}

/** Pendentes agrupadas da prioridade mais alta para a mais baixa. */
export function groupTasksByPriority(tasks: Task[], filter: PriorityFilter): TaskGroup[] {
  const pending = tasks.filter((task) => !task.completed)
  return [...PRIORITIES]
    .sort((a, b) => PRIORITY_META[b].rank - PRIORITY_META[a].rank)
    .filter((priority) => filter === "all" || priority === filter)
    .map((priority) => ({
      key: `priority-${priority}`,
      label: priority === "none" ? "Sem prioridade" : PRIORITY_META[priority].label,
      priority,
      tasks: pending.filter((task) => task.priority === priority).sort(compareTasks),
    }))
    .filter((group) => group.tasks.length > 0)
}
