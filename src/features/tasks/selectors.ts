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

export type ViewMode = "date" | "priority"

/** Visão por período. */
export type TaskFilter = "all" | "today" | "tomorrow" | "week" | "month"

export const FILTERS: { value: TaskFilter; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "today", label: "Hoje" },
  { value: "tomorrow", label: "Amanhã" },
  { value: "week", label: "Semana" },
  { value: "month", label: "Mês" },
]

/** Visão por prioridade. */
export type PriorityFilter = "all" | Priority

export const PRIORITY_FILTERS: { value: PriorityFilter; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "urgent", label: "Urgente" },
  { value: "high", label: "Alta" },
  { value: "medium", label: "Média" },
  { value: "low", label: "Baixa" },
  { value: "none", label: "Sem prioridade" },
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

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function dayLabel(dateKey: string, today: string, tomorrow: string) {
  if (dateKey === today) return "Hoje"
  if (dateKey === tomorrow) return "Amanhã"
  return capitalize(format(parseISO(dateKey), "EEEE, d MMM", { locale: ptBR }))
}

function compareByDue(a: Task, b: Task) {
  const aDue = `${a.dueDate ?? "~"}T${a.dueTime ?? "99:99"}`
  const bDue = `${b.dueDate ?? "~"}T${b.dueTime ?? "99:99"}`
  if (aDue !== bDue) return aDue < bDue ? -1 : 1
  const byPriority = PRIORITY_META[b.priority].rank - PRIORITY_META[a.priority].rank
  if (byPriority !== 0) return byPriority
  return a.createdAt < b.createdAt ? -1 : 1
}

/** Data decrescente (mais distante primeiro); sem data, cai para prioridade. */
function compareByDueDesc(a: Task, b: Task) {
  if (a.dueDate && b.dueDate) {
    const aDue = `${a.dueDate}T${a.dueTime ?? "00:00"}`
    const bDue = `${b.dueDate}T${b.dueTime ?? "00:00"}`
    if (aDue !== bDue) return aDue < bDue ? 1 : -1
  }
  return compareTasks(a, b)
}

/** Concluídas, da mais recente para a mais antiga. */
function completedGroups(tasks: Task[]): TaskGroup[] {
  const done = tasks
    .filter((task) => task.completed)
    .sort((a, b) => ((a.completedAt ?? "") < (b.completedAt ?? "") ? 1 : -1))
  return done.length ? [{ key: "done", label: "Concluídas", tasks: done }] : []
}

/** Pendentes agrupadas por período, com as concluídas no final. */
export function groupTasks(tasks: Task[], filter: TaskFilter): TaskGroup[] {
  return [...groupPending(tasks, filter), ...completedGroups(tasks)]
}

function groupPending(tasks: Task[], filter: TaskFilter): TaskGroup[] {
  const today = todayKey()
  const tomorrow = toDateKey(addDays(new Date(), 1))
  const pending = tasks.filter((task) => !task.completed)
  const sorted = (group: TaskGroup) => ({ ...group, tasks: group.tasks.sort(compareTasks) })
  const overdue: TaskGroup = {
    key: "overdue",
    label: "Atrasadas",
    tasks: pending.filter(isOverdue),
  }
  const notOverdue = pending.filter((task) => !isOverdue(task))

  if (filter === "week") {
    // Hoje e os 6 dias seguintes, um grupo por dia
    const weekEnd = toDateKey(addDays(new Date(), 6))
    const byDay = new Map<string, Task[]>()
    for (const task of notOverdue) {
      if (!task.dueDate || task.dueDate > weekEnd) continue
      byDay.set(task.dueDate, [...(byDay.get(task.dueDate) ?? []), task])
    }
    const days = [...byDay.keys()].sort().map<TaskGroup>((key) => ({
      key: `day-${key}`,
      label: dayLabel(key, today, tomorrow),
      tasks: byDay.get(key)!,
    }))
    return [overdue, ...days].filter((group) => group.tasks.length > 0).map(sorted)
  }

  if (filter === "month") {
    // Hoje e os 29 dias seguintes, em blocos de 7 dias
    const monthEnd = toDateKey(addDays(new Date(), 29))
    const start = startOfDay(new Date())
    const weeks: TaskGroup[] = []
    for (const task of notOverdue) {
      if (!task.dueDate || task.dueDate > monthEnd) continue
      const offset = Math.floor((parseISO(task.dueDate).getTime() - start.getTime()) / 86_400_000)
      const index = Math.floor(offset / 7)
      if (!weeks[index]) {
        const first = addDays(start, index * 7)
        const last = addDays(first, 6)
        weeks[index] = {
          key: `week-${index}`,
          label:
            index === 0
              ? "Esta semana"
              : index === 1
                ? "Semana que vem"
                : `${format(first, "d MMM", { locale: ptBR })} a ${format(last, "d MMM", { locale: ptBR })}`,
          tasks: [],
        }
      }
      weeks[index].tasks.push(task)
    }
    return [overdue, ...weeks.filter(Boolean)]
      .filter((group) => group.tasks.length > 0)
      .map((group) => ({ ...group, tasks: group.tasks.sort(compareByDue) }))
  }

  const buckets: Record<string, TaskGroup> = {
    overdue,
    today: { key: "today", label: "Hoje", tasks: [] },
    tomorrow: { key: "tomorrow", label: "Amanhã", tasks: [] },
    later: { key: "later", label: "Próximas", tasks: [] },
    someday: { key: "someday", label: "Sem data", tasks: [] },
  }
  for (const task of notOverdue) {
    if (!task.dueDate) buckets.someday.tasks.push(task)
    else if (task.dueDate === today) buckets.today.tasks.push(task)
    else if (task.dueDate === tomorrow) buckets.tomorrow.tasks.push(task)
    else buckets.later.tasks.push(task)
  }

  const keys =
    filter === "today"
      ? ["overdue", "today"]
      : filter === "tomorrow"
        ? ["tomorrow"]
        : ["overdue", "today", "tomorrow", "later", "someday"]

  return keys
    .map((key) => buckets[key])
    .filter((group) => group.tasks.length > 0)
    .map((group) =>
      // Em "Todas" a lista é do mais distante para o mais próximo
      filter === "all"
        ? { ...group, tasks: group.tasks.sort(compareByDueDesc) }
        : sorted(group)
    )
}

/** Pendentes da prioridade mais alta para a mais baixa, com as concluídas no final. */
export function groupTasksByPriority(tasks: Task[], filter: PriorityFilter): TaskGroup[] {
  const matches = (task: Task) => filter === "all" || task.priority === filter
  return [...groupPendingByPriority(tasks, filter), ...completedGroups(tasks.filter(matches))]
}

function groupPendingByPriority(tasks: Task[], filter: PriorityFilter): TaskGroup[] {
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
