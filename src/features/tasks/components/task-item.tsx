import { CalendarIcon } from "lucide-react"
import { toast } from "sonner"

import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"

import { setTaskCompleted } from "../repository"
import { formatDue, isOverdue } from "../selectors"
import { useTaskUi } from "../store"
import type { Task } from "../types"
import { PriorityBadge } from "./priority-badge"

const CHECKBOX_COLORS: Record<Task["priority"], string> = {
  none: "",
  low: "border-priority-low",
  medium: "border-priority-medium",
  high: "border-priority-high",
  urgent: "border-priority-urgent",
}

export function TaskItem({ task }: { task: Task }) {
  const openEdit = useTaskUi((s) => s.openEdit)
  const due = formatDue(task)
  const overdue = isOverdue(task)

  async function toggle(checked: boolean) {
    await setTaskCompleted(task.id, checked)
    if (checked) {
      toast("Tarefa concluída", {
        description: task.title,
        action: {
          label: "Desfazer",
          onClick: () => setTaskCompleted(task.id, false),
        },
      })
    }
  }

  return (
    <li className="group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/50">
      <Checkbox
        checked={task.completed}
        onCheckedChange={(checked) => toggle(checked === true)}
        aria-label={task.completed ? "Marcar como pendente" : "Concluir tarefa"}
        className={cn(
          "mt-0.5 size-5 rounded-full",
          !task.completed && CHECKBOX_COLORS[task.priority]
        )}
      />
      <button
        type="button"
        onClick={() => openEdit(task)}
        className="flex min-w-0 flex-1 flex-col items-start gap-0 text-left outline-none"
      >
        <span
          className={cn(
            "text-[15px] leading-snug",
            task.completed && "text-muted-foreground line-through"
          )}
        >
          {task.title}
        </span>
        {task.description && (
          <span className="line-clamp-1 text-sm text-muted-foreground">
            {task.description}
          </span>
        )}
        {(due || task.priority !== "none") && (
          <span className="flex flex-wrap items-center gap-x-2.5">
            {due && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 text-xs text-muted-foreground",
                  overdue && "text-destructive"
                )}
              >
                <CalendarIcon className="size-3" />
                {due}
              </span>
            )}
            {!task.completed && <PriorityBadge priority={task.priority} />}
          </span>
        )}
      </button>
    </li>
  )
}
