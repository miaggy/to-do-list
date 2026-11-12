import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { groupTasks, groupTasksByPriority } from "./selectors"
import type { Priority, Task } from "./types"

let id = 0
function task(title: string, dueDate: string | null, extra: Partial<Task> = {}): Task {
  return {
    id: String(++id),
    title,
    description: "",
    dueDate,
    dueTime: null,
    priority: "none" as Priority,
    completed: false,
    completedAt: null,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    deletedAt: null,
    source: "manual",
    ...extra,
  }
}

const summary = (groups: ReturnType<typeof groupTasks>) =>
  groups.map((group) => `${group.label}: ${group.tasks.map((t) => t.title).join(", ")}`)

const tasks = [
  task("atrasada", "2026-10-29"),
  task("hoje", "2026-10-31"),
  task("amanhã", "2026-11-01"),
  task("quarta", "2026-11-04"),
  task("dia 6", "2026-11-06"),
  task("dia 9", "2026-11-09"),
  task("dia 20", "2026-11-20"),
  task("dia 30", "2026-11-30"),
  task("sem data", null),
  task("feita", "2026-10-30", { completed: true, completedAt: "2026-10-30T12:00:00.000Z" }),
]

describe("visão por período", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 31, 14, 20)) // sábado
  })
  afterEach(() => vi.useRealTimers())

  it("semana: hoje e os 6 dias seguintes, um grupo por dia", () => {
    expect(summary(groupTasks(tasks, "week"))).toEqual([
      "Atrasadas: atrasada",
      "Hoje: hoje",
      "Amanhã: amanhã",
      "Quarta-feira, 4 nov: quarta",
      "Sexta-feira, 6 nov: dia 6",
      "Concluídas: feita",
    ])
  })

  it("mês: hoje e os 29 dias seguintes, em blocos de 7 dias", () => {
    expect(summary(groupTasks(tasks, "month"))).toEqual([
      "Atrasadas: atrasada",
      "Esta semana: hoje, amanhã, quarta, dia 6",
      "Semana que vem: dia 9",
      "14 nov a 20 nov: dia 20",
      "Concluídas: feita",
    ])
  })

  it("todas: dentro de cada grupo, da data mais próxima de hoje para a mais distante", () => {
    expect(summary(groupTasks(tasks, "all"))).toEqual([
      "Atrasadas: atrasada",
      "Hoje: hoje",
      "Amanhã: amanhã",
      "Próximas: quarta, dia 6, dia 9, dia 20, dia 30",
      "Sem data: sem data",
      "Concluídas: feita",
    ])
  })

  it("atrasadas: da mais recente para a mais antiga", () => {
    const list = [task("velha", "2026-10-20"), task("recente", "2026-10-30"), task("meio", "2026-10-25")]
    expect(summary(groupTasks(list, "all"))).toEqual(["Atrasadas: recente, meio, velha"])
  })

  it("hoje e amanhã", () => {
    expect(summary(groupTasks(tasks, "today"))).toEqual(["Atrasadas: atrasada", "Hoje: hoje", "Concluídas: feita"])
    expect(summary(groupTasks(tasks, "tomorrow"))).toEqual(["Amanhã: amanhã", "Concluídas: feita"])
  })
})

describe("visão por prioridade", () => {
  const list = [
    task("a", null, { priority: "low" }),
    task("b", null, { priority: "urgent" }),
    task("c", null),
    task("d", null, { priority: "urgent", completed: true, completedAt: "2026-10-30T10:00:00.000Z" }),
  ]

  it("todas: pendentes da mais urgente para a menos, sem prioridade por último", () => {
    expect(summary(groupTasksByPriority(list, "all"))).toEqual([
      "Urgente: b",
      "Baixa: a",
      "Sem prioridade: c",
      "Concluídas: d",
    ])
  })

  it("filtra por sem prioridade (concluídas também respeitam o filtro)", () => {
    expect(summary(groupTasksByPriority(list, "none"))).toEqual(["Sem prioridade: c"])
    expect(summary(groupTasksByPriority(list, "urgent"))).toEqual(["Urgente: b", "Concluídas: d"])
  })
})
