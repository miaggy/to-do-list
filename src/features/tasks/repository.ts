import { requestSync } from "../sync/sync-engine"
import { db } from "./db"
import type { Task, TaskDraft, TaskSource } from "./types"

function now() {
  return new Date().toISOString()
}

/** Grava a tarefa e a coloca na fila de envio para a nuvem. */
async function save(task: Task) {
  await db.transaction("rw", db.tasks, db.outbox, async () => {
    await db.tasks.put(task)
    await db.outbox.put({ id: task.id, updatedAt: task.updatedAt })
  })
  requestSync()
}

async function change(id: string, changes: Partial<Task>) {
  const task = await db.tasks.get(id)
  if (!task) return undefined
  const updated = { ...task, ...changes, updatedAt: now() }
  await save(updated)
  return updated
}

export async function createTask(draft: TaskDraft, source: TaskSource) {
  const timestamp = now()
  const task: Task = {
    ...draft,
    title: draft.title.trim(),
    description: draft.description.trim(),
    id: crypto.randomUUID(),
    completed: false,
    completedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
    source,
  }
  await save(task)
  return task
}

export async function updateTask(id: string, draft: TaskDraft) {
  await change(id, {
    ...draft,
    title: draft.title.trim(),
    description: draft.description.trim(),
  })
}

export async function setTaskCompleted(id: string, completed: boolean) {
  await change(id, { completed, completedAt: completed ? now() : null })
}

export async function deleteTask(id: string) {
  const task = await db.tasks.get(id)
  await change(id, { deletedAt: now() })
  return task
}

/** Restaura uma tarefa excluída (usado pelo "Desfazer"). */
export async function restoreTask(task: Task) {
  await save({ ...task, deletedAt: null, updatedAt: now() })
}
