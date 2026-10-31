export const PRIORITIES = ["none", "low", "medium", "high", "urgent"] as const

export type Priority = (typeof PRIORITIES)[number]

export type TaskSource = "manual" | "text" | "voice"

export interface Task {
  id: string
  title: string
  description: string
  /** Data local no formato yyyy-MM-dd */
  dueDate: string | null
  /** Hora local no formato HH:mm */
  dueTime: string | null
  priority: Priority
  completed: boolean
  completedAt: string | null
  createdAt: string
  updatedAt: string
  /** Exclusão suave: a remoção precisa chegar aos outros aparelhos. */
  deletedAt: string | null
  source: TaskSource
}

export type TaskDraft = Pick<
  Task,
  "title" | "description" | "dueDate" | "dueTime" | "priority"
>

export const EMPTY_DRAFT: TaskDraft = {
  title: "",
  description: "",
  dueDate: null,
  dueTime: null,
  priority: "none",
}

export const PRIORITY_META: Record<
  Priority,
  { label: string; rank: number; className: string; dotClassName: string }
> = {
  none: {
    label: "Nenhuma",
    rank: 0,
    className: "text-muted-foreground border-border",
    dotClassName: "bg-muted-foreground/40",
  },
  low: {
    label: "Baixa",
    rank: 1,
    className: "text-priority-low border-priority-low/40 bg-priority-low/10",
    dotClassName: "bg-priority-low",
  },
  medium: {
    label: "Média",
    rank: 2,
    className:
      "text-priority-medium border-priority-medium/40 bg-priority-medium/10",
    dotClassName: "bg-priority-medium",
  },
  high: {
    label: "Alta",
    rank: 3,
    className: "text-priority-high border-priority-high/40 bg-priority-high/10",
    dotClassName: "bg-priority-high",
  },
  urgent: {
    label: "Urgente",
    rank: 4,
    className:
      "text-priority-urgent border-priority-urgent/40 bg-priority-urgent/10",
    dotClassName: "bg-priority-urgent",
  },
}
