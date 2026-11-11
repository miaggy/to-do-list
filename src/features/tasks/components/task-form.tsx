import { zodResolver } from "@hookform/resolvers/zod"
import { format, parseISO } from "date-fns"
import { ptBR as datePtBR } from "date-fns/locale"
import { CalendarIcon, Trash2Icon, XIcon } from "lucide-react"
import { useState } from "react"
import { ptBR } from "react-day-picker/locale"
import { Controller, useForm } from "react-hook-form"
import { z } from "zod"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

import { toDateKey } from "../selectors"
import { EMPTY_DRAFT, PRIORITIES, PRIORITY_META, type TaskDraft } from "../types"
import { PriorityDot } from "./priority-badge"

const taskSchema = z.object({
  title: z.string().trim().min(1, "Dê um título para a tarefa").max(200),
  description: z.string().max(2000),
  dueDate: z.string().nullable(),
  dueTime: z.string().nullable(),
  priority: z.enum(PRIORITIES),
})

interface TaskFormProps {
  defaultValues?: Partial<TaskDraft>
  submitLabel: string
  onSubmit: (draft: TaskDraft) => void | Promise<void>
  onDelete?: () => void
}

export function TaskForm({
  defaultValues,
  submitLabel,
  onSubmit,
  onDelete,
}: TaskFormProps) {
  const [calendarOpen, setCalendarOpen] = useState(false)
  const form = useForm<TaskDraft>({
    resolver: zodResolver(taskSchema),
    defaultValues: { ...EMPTY_DRAFT, ...defaultValues },
  })
  const { register, control, handleSubmit, watch, setValue, formState } = form
  const dueDate = watch("dueDate")

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex flex-col gap-5"
      noValidate
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="title">Título</Label>
        <Input
          id="title"
          placeholder="Ex.: Pagar a conta de luz"
          autoComplete="off"
          aria-invalid={!!formState.errors.title}
          {...register("title")}
        />
        {formState.errors.title && (
          <p className="text-sm text-destructive">
            {formState.errors.title.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="description">Descrição</Label>
        <Textarea
          id="description"
          placeholder="Detalhes opcionais"
          rows={3}
          {...register("description")}
        />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-3">
        <div className="flex flex-col gap-2">
          <Label>Data</Label>
          <div className="relative">
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className={cn(
                    "w-full justify-start rounded-2xl border-transparent bg-muted px-4 font-normal hover:bg-muted/70",
                    dueDate && "pr-11",
                    !dueDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon />
                  {dueDate
                    ? format(parseISO(dueDate), "EEE, d 'de' MMM", {
                        locale: datePtBR,
                      })
                    : "Sem data"}
                </Button>
              </PopoverTrigger>
              {/* z-60: precisa ficar acima do Drawer/Dialog (z-50) */}
              <PopoverContent className="z-60 w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  locale={ptBR}
                  selected={dueDate ? parseISO(dueDate) : undefined}
                  defaultMonth={dueDate ? parseISO(dueDate) : undefined}
                  onSelect={(date) => {
                    setValue("dueDate", date ? toDateKey(date) : null, {
                      shouldDirty: true,
                    })
                    if (!date) setValue("dueTime", null)
                    setCalendarOpen(false)
                  }}
                />
              </PopoverContent>
            </Popover>
            {dueDate && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="absolute top-1/2 right-1.5 -translate-y-1/2 text-muted-foreground"
                aria-label="Remover data"
                onClick={() => {
                  setValue("dueDate", null, { shouldDirty: true })
                  setValue("dueTime", null)
                }}
              >
                <XIcon />
              </Button>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="dueTime">Hora</Label>
          <Controller
            control={control}
            name="dueTime"
            render={({ field }) => (
              <Input
                id="dueTime"
                type="time"
                className="w-full px-3"
                disabled={!dueDate}
                value={field.value ?? ""}
                onChange={(e) => field.onChange(e.target.value || null)}
              />
            )}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label id="priority-label">Prioridade</Label>
        <Controller
          control={control}
          name="priority"
          render={({ field }) => (
            <div
              role="radiogroup"
              aria-labelledby="priority-label"
              className="grid grid-cols-5 gap-1 rounded-2xl bg-muted p-1"
            >
              {PRIORITIES.map((priority) => {
                const selected = field.value === priority
                return (
                  <button
                    key={priority}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => field.onChange(priority)}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-xl px-1 py-2 text-xs text-muted-foreground transition-colors",
                      selected && "bg-card font-semibold text-foreground shadow-sm"
                    )}
                  >
                    <PriorityDot priority={priority} />
                    {PRIORITY_META[priority].label}
                  </button>
                )
              })}
            </div>
          )}
        />
      </div>

      <div className="flex gap-2 pt-1">
        {onDelete && (
          <Button
            type="button"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2Icon />
            Excluir
          </Button>
        )}
        <Button type="submit" className="flex-1" disabled={formState.isSubmitting}>
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}
