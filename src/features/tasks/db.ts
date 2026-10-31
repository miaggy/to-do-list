import Dexie, { type EntityTable } from "dexie"

import type { Task } from "./types"

/** Tarefa alterada localmente que ainda não foi enviada para a nuvem. */
export interface OutboxEntry {
  id: string
  updatedAt: string
}

export interface MetaEntry {
  key: string
  value: string
}

export const db = new Dexie("todo-voice") as Dexie & {
  tasks: EntityTable<Task, "id">
  outbox: EntityTable<OutboxEntry, "id">
  meta: EntityTable<MetaEntry, "key">
}

db.version(1).stores({
  tasks: "id, completed, dueDate, priority, createdAt",
})

db.version(2)
  .stores({
    tasks: "id, completed, dueDate, priority, createdAt",
    outbox: "id",
    meta: "key",
  })
  .upgrade((tx) =>
    tx
      .table("tasks")
      .toCollection()
      .modify((task: Task) => {
        task.deletedAt ??= null
      })
  )
