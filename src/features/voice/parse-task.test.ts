import { describe, expect, it } from "vitest"

import { parseTask } from "./parse-task"

// Sábado, 31/10/2026, 14:20
const NOW = new Date(2026, 9, 31, 14, 20)

function parse(phrase: string) {
  const { draft } = parseTask(phrase, NOW)
  return { title: draft.title, date: draft.dueDate, time: draft.dueTime, priority: draft.priority }
}

describe("hora", () => {
  it.each([
    ["Pagar a luz amanhã às 10:00, prioridade alta.", "2026-11-01", "10:00"],
    ["Reunião amanhã às 10h30.", "2026-11-01", "10:30"],
    ["Dentista na segunda-feira às 15 horas.", "2026-11-02", "15:00"],
    ["Buscar as crianças às 17h45", "2026-10-31", "17:45"],
    ["Academia amanhã às 6 da manhã", "2026-11-01", "06:00"],
    ["Dormir às 9 horas da noite", "2026-10-31", "21:00"],
    ["Jantar com a família às 8 da noite", "2026-10-31", "20:00"],
    ["Almoço amanhã ao meio-dia", "2026-11-01", "12:00"],
    ["Reunião amanhã 14h", "2026-11-01", "14:00"],
    ["Entregar até as 10h", "2026-11-01", "10:00"],
  ])("lê a hora digitada em %s", (phrase, date, time) => {
    expect(parse(phrase)).toMatchObject({ date, time })
  })

  it.each([
    ["Jantar sexta às oito e meia da noite", "2026-11-06", "20:30"],
    ["Dentista amanhã às 3 e quinze da tarde", "2026-11-01", "15:15"],
    ["Dentista amanhã às 3 e quarenta e cinco da tarde", "2026-11-01", "15:45"],
    ["Reunião às dez horas amanhã", "2026-11-01", "10:00"],
    ["Ligar às sete amanhã", "2026-11-01", "07:00"],
    ["Reunião às 14 horas e 30 minutos", "2026-10-31", "14:30"],
  ])("lê a hora por extenso em %s", (phrase, date, time) => {
    expect(parse(phrase)).toMatchObject({ date, time })
  })

  it("não confunde número por extenso no meio da frase com hora", () => {
    expect(parse("Ligar às duas clientes amanhã")).toMatchObject({
      title: "Ligar às duas clientes",
      date: "2026-11-01",
      time: null,
    })
  })

  it.each([
    ["Tomar remédio daqui a 2 horas", "16:20"],
    ["Ligar para o João em 30 minutos", "14:50"],
    ["Sair daqui a meia hora", "14:50"],
    ["Mexer na massa daqui a uma hora e meia", "15:50"],
  ])("entende tempo relativo em %s", (phrase, time) => {
    expect(parse(phrase)).toMatchObject({ date: "2026-10-31", time })
  })

  it("passa para o dia seguinte quando o tempo relativo cruza a meia-noite", () => {
    const { draft } = parseTask("Ligar daqui a 10 horas", NOW)
    expect(draft).toMatchObject({ dueDate: "2026-11-01", dueTime: "00:20" })
  })

  it.each([
    ["Reunião amanhã de manhã", "2026-11-01", "09:00"],
    ["Corrida hoje à noite", "2026-10-31", "20:00"],
    ["Visitar a vovó amanhã à tarde", "2026-11-01", "15:00"],
  ])("assume um horário para o período do dia em %s", (phrase, date, time) => {
    expect(parse(phrase)).toMatchObject({ date, time })
  })

  it("não trata 'boa noite' no título como período", () => {
    expect(parse("Desejar boa noite")).toMatchObject({ title: "Desejar boa noite", time: null })
  })

  it("sem data, uma hora que já passou vale para amanhã", () => {
    expect(parse("Tomar remédio as 8")).toMatchObject({ date: "2026-11-01", time: "08:00" })
    expect(parse("Estudar às 22")).toMatchObject({ date: "2026-10-31", time: "22:00" })
  })
})

describe("título, data e prioridade", () => {
  it("separa título, descrição, data, hora e prioridade", () => {
    const { draft } = parseTask(
      "Criar tarefa pagar a conta de luz amanhã às 10, prioridade alta, descrição vence dia 5",
      NOW
    )
    expect(draft).toEqual({
      title: "Pagar a conta de luz",
      description: "Vence dia 5",
      dueDate: "2026-11-01",
      dueTime: "10:00",
      priority: "high",
    })
  })
})
