import { db } from "./db"
import type { Task, TaskDraft, TaskSource } from "./types"

function now() {
  return new Date().toISOString()
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
    source,
  }
  await db.tasks.add(task)
  return task
}

export async function updateTask(id: string, draft: TaskDraft) {
  await db.tasks.update(id, {
    ...draft,
    title: draft.title.trim(),
    description: draft.description.trim(),
    updatedAt: now(),
  })
}

export async function setTaskCompleted(id: string, completed: boolean) {
  const timestamp = now()
  await db.tasks.update(id, {
    completed,
    completedAt: completed ? timestamp : null,
    updatedAt: timestamp,
  })
}

export async function deleteTask(id: string) {
  const task = await db.tasks.get(id)
  await db.tasks.delete(id)
  return task
}

/** Restaura uma tarefa excluída (usado pelo "Desfazer"). */
export async function restoreTask(task: Task) {
  await db.tasks.put(task)
}
