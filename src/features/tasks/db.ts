import Dexie, { type EntityTable } from "dexie"

import type { Task } from "./types"

export const db = new Dexie("todo-voice") as Dexie & {
  tasks: EntityTable<Task, "id">
}

db.version(1).stores({
  tasks: "id, completed, dueDate, priority, createdAt",
})
