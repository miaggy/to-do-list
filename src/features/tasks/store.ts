import { create } from "zustand"

import type { TaskFilter } from "./selectors"
import type { Task, TaskDraft, TaskSource } from "./types"

type FormState =
  | { mode: "closed" }
  | { mode: "create"; draft?: Partial<TaskDraft>; source: TaskSource; transcript?: string }
  | { mode: "edit"; task: Task }

interface TaskUiState {
  filter: TaskFilter
  form: FormState
  setFilter: (filter: TaskFilter) => void
  openCreate: (options?: {
    draft?: Partial<TaskDraft>
    source?: TaskSource
    transcript?: string
  }) => void
  openEdit: (task: Task) => void
  closeForm: () => void
}

export const useTaskUi = create<TaskUiState>((set) => ({
  filter: "all",
  form: { mode: "closed" },
  setFilter: (filter) => set({ filter }),
  openCreate: (options) =>
    set({
      form: {
        mode: "create",
        draft: options?.draft,
        source: options?.source ?? "manual",
        transcript: options?.transcript,
      },
    }),
  openEdit: (task) => set({ form: { mode: "edit", task } }),
  closeForm: () => set({ form: { mode: "closed" } }),
}))
