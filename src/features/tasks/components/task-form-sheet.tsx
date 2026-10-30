import { useState } from "react"
import { toast } from "sonner"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"
import { useMediaQuery } from "@/hooks/use-media-query"

import { createTask, deleteTask, restoreTask, updateTask } from "../repository"
import { useTaskUi } from "../store"
import type { TaskDraft } from "../types"
import { TaskForm } from "./task-form"

/** Formulário de criar/editar: Dialog no desktop, Drawer no mobile. */
export function TaskFormSheet() {
  const currentForm = useTaskUi((s) => s.form)
  const closeForm = useTaskUi((s) => s.closeForm)
  const isDesktop = useMediaQuery("(min-width: 768px)")

  // Mantém o último conteúdo enquanto a animação de fechar acontece
  const [form, setForm] = useState(currentForm)
  const [formKey, setFormKey] = useState(0)
  if (currentForm.mode !== "closed" && currentForm !== form) {
    setForm(currentForm)
    setFormKey((k) => k + 1)
  }

  const open = currentForm.mode !== "closed"
  const isEdit = form.mode === "edit"
  const title = isEdit ? "Editar tarefa" : "Nova tarefa"
  const description =
    form.mode === "create" && form.transcript
      ? `“${form.transcript}”`
      : isEdit
        ? "Altere os detalhes da tarefa."
        : "Preencha os detalhes da tarefa."

  async function handleSubmit(draft: TaskDraft) {
    if (form.mode === "edit") {
      await updateTask(form.task.id, draft)
      toast.success("Tarefa atualizada")
    } else if (form.mode === "create") {
      await createTask(draft, form.source)
      toast.success("Tarefa criada", { description: draft.title })
    }
    closeForm()
  }

  async function handleDelete() {
    if (form.mode !== "edit") return
    const removed = await deleteTask(form.task.id)
    closeForm()
    if (removed) {
      toast("Tarefa excluída", {
        description: removed.title,
        action: { label: "Desfazer", onClick: () => restoreTask(removed) },
      })
    }
  }

  const body = form.mode !== "closed" && (
    <TaskForm
      // Recria o formulário a cada abertura
      key={formKey}
      defaultValues={form.mode === "edit" ? form.task : form.draft}
      submitLabel={isEdit ? "Salvar" : "Criar tarefa"}
      onSubmit={handleSubmit}
      onDelete={isEdit ? handleDelete : undefined}
    />
  )

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={(o) => !o && closeForm()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          {body}
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Drawer open={open} onOpenChange={(o) => !o && closeForm()} repositionInputs={false}>
      <DrawerContent>
        <DrawerHeader className="text-left">
          <DrawerTitle>{title}</DrawerTitle>
          <DrawerDescription>{description}</DrawerDescription>
        </DrawerHeader>
        <div className="overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {body}
        </div>
      </DrawerContent>
    </Drawer>
  )
}
