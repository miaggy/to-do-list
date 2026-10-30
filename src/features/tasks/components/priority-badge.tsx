import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

import { PRIORITY_META, type Priority } from "../types"

export function PriorityDot({
  priority,
  className,
}: {
  priority: Priority
  className?: string
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block size-2 shrink-0 rounded-full",
        PRIORITY_META[priority].dotClassName,
        className
      )}
    />
  )
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  if (priority === "none") return null
  const meta = PRIORITY_META[priority]
  return (
    <Badge variant="outline" className={cn("gap-1.5 font-medium", meta.className)}>
      <PriorityDot priority={priority} />
      {meta.label}
    </Badge>
  )
}
