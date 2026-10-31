import { create } from "zustand"

import type { PriorityFilter, TaskFilter, ViewMode } from "./selectors"
import type { Task, TaskDraft, TaskSource } from "./types"

type FormState =
  | { mode: "closed" }
  | { mode: "create"; draft?: Partial<TaskDraft>; source: TaskSource; transcript?: string }
  | { mode: "edit"; task: Task }

const VIEW_KEY = "task-view"

function readStoredView(): ViewMode {
  try {
    return localStorage.getItem(VIEW_KEY) === "priority" ? "priority" : "date"
  } catch {
    return "date"
  }
}

interface TaskUiState {
  view: ViewMode
  filter: TaskFilter
  priorityFilter: PriorityFilter
  form: FormState
  setView: (view: ViewMode) => void
  setFilter: (filter: TaskFilter) => void
  setPriorityFilter: (filter: PriorityFilter) => void
  openCreate: (options?: {
    draft?: Partial<TaskDraft>
    source?: TaskSource
    transcript?: string
  }) => void
  openEdit: (task: Task) => void
  closeForm: () => void
}

export const useTaskUi = create<TaskUiState>((set) => ({
  view: readStoredView(),
  filter: "all",
  priorityFilter: "all",
  form: { mode: "closed" },
  setView: (view) => {
    try {
      localStorage.setItem(VIEW_KEY, view)
    } catch {
      // a visão preferida é só uma conveniência
    }
    set({ view })
  },
  setFilter: (filter) => set({ filter }),
  setPriorityFilter: (priorityFilter) => set({ priorityFilter }),
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
