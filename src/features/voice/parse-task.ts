import {
  addDays,
  addMonths,
  addWeeks,
  format,
  isBefore,
  nextDay,
  startOfDay,
  type Day,
} from "date-fns"

import type { Priority, TaskDraft } from "../tasks/types"

/**
 * Parser por regras que transforma uma frase em português numa tarefa.
 * Ex.: "criar tarefa pagar a conta de luz amanhã às 10, prioridade alta,
 * descrição vence dia 5" → título, data, hora, prioridade e descrição.
 *
 * Fica isolado aqui para poder ser trocado (ou complementado) por um LLM.
 */

const NUMBER_WORDS: Record<string, number> = {
  um: 1, uma: 1, dois: 2, duas: 2, "três": 3, tres: 3, quatro: 4, cinco: 5,
  seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12,
  treze: 13, quatorze: 14, catorze: 14, quinze: 15, dezesseis: 16,
  dezessete: 17, dezoito: 18, dezenove: 19, vinte: 20, trinta: 30,
}

const MONTHS: Record<string, number> = {
  janeiro: 0, fevereiro: 1, "março": 2, marco: 2, abril: 3, maio: 4,
  junho: 5, julho: 6, agosto: 7, setembro: 8, outubro: 9, novembro: 10,
  dezembro: 11,
}

const WEEKDAYS: [RegExp, Day][] = [
  [/^domingo/, 0],
  [/^segunda/, 1],
  [/^ter[çc]a/, 2],
  [/^quarta/, 3],
  [/^quinta/, 4],
  [/^sexta/, 5],
  [/^s[áa]bado/, 6],
]

const PRIORITY_WORDS: [RegExp, Priority][] = [
  [/^(nenhuma|sem prioridade)$/, "none"],
  [/^baixa$/, "low"],
  [/^(m[ée]dia|normal)$/, "medium"],
  [/^alta$/, "high"],
  [/^(urgente|m[áa]xima|muito alta|alt[íi]ssima)$/, "urgent"],
]

const NUM = String.raw`\d{1,2}|${Object.keys(NUMBER_WORDS).join("|")}`
const MONTH = Object.keys(MONTHS).join("|")

function toNumber(value: string) {
  const n = Number(value)
  return Number.isNaN(n) ? NUMBER_WORDS[value.toLowerCase()] : n
}

function stripAccents(value: string) {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "")
}

export interface ParsedTask {
  draft: TaskDraft
  /** Quais campos foram reconhecidos na frase. */
  found: { date: boolean; time: boolean; priority: boolean; description: boolean }
}

export function parseTask(input: string, now = new Date()): ParsedTask {
  let text = ` ${input.trim().replace(/[.!]+$/, "")} `
  const found = { date: false, time: false, priority: false, description: false }
  let priority: Priority = "none"
  let description = ""
  let dueDate: Date | null = null
  let dueTime: string | null = null

  const take = (re: RegExp) => {
    const match = text.match(re)
    if (match) text = text.replace(match[0], " ")
    return match
  }

  // 1. Comando inicial: "criar tarefa", "me lembra de", "nova tarefa:" …
  take(
    /^\s*(?:ok,?\s+)?(?:por favor,?\s+)?(?:(?:cri[ea]r?|adicion[ea]r?|anot[ea]r?|registr[ea]r?|coloc[ea]r?|p[õo]e)\s+(?:uma\s+|a\s+)?(?:nova\s+)?(?:tarefa|lembrete)?|nova\s+tarefa|(?:me\s+)?lembr(?:e|a|ar)(?:-me)?)\s*(?:de|para|pra|que|:)?\s+/i
  )

  // 2. Prioridade: "prioridade alta", "alta prioridade", "é urgente"
  const priorityMatch =
    take(
      /[\s,]+(?:com\s+)?(?:prioridade|urg[êe]ncia)\s+(nenhuma|baixa|m[ée]dia|normal|alta|urgente|m[áa]xima|muito alta|alt[íi]ssima)(?=[\s,.]|$)/i
    ) ??
    take(/[\s,]+(?:com\s+)?(baixa|m[ée]dia|alta)\s+prioridade(?=[\s,.]|$)/i) ??
    take(/[\s,]+(?:[ée]\s+)?(urgente|sem prioridade)(?=[\s,.]|$)/i) ??
    take(/[\s,]+(?:[ée]\s+)?(importante)(?=[\s,.]|$)/i)
  if (priorityMatch) {
    const word = priorityMatch[1].toLowerCase()
    priority =
      word === "importante"
        ? "high"
        : (PRIORITY_WORDS.find(([re]) => re.test(word))?.[1] ?? "none")
    found.priority = true
  }

  // 3. Descrição: tudo depois de "descrição", "detalhes", "observação"
  const descriptionMatch = take(
    /[\s,]+(?:com\s+(?:a\s+)?)?(?:descri[çc][ãa]o|detalhes|observa[çc][ãa]o|obs)\s*:?\s+(.+)$/i
  )
  if (descriptionMatch) {
    description = descriptionMatch[1].trim().replace(/^[,:]\s*/, "")
    description = description.charAt(0).toUpperCase() + description.slice(1)
    found.description = true
  }

  // 4. Hora: "às 10", "as 10h30", "10:30", "às 3 da tarde", "meio-dia"
  // Números por extenso só contam como hora com "horas" ou "da tarde" etc.,
  // para não confundir "ligar às duas clientes" com 2h.
  const timeMatch =
    take(/[\s,]+(?:[àa]s|para as|pras|at[ée] as)\s+(\d{1,2})(?:\s*(?::|h)\s*(\d{2}))?\s*(?:h(?:oras?)?|hrs?)?(?:\s+e\s+(meia|\d{2}))?(?:\s+(?:da|de)\s+(manh[ãa]|tarde|noite|madrugada))?(?=[\s,.]|$)/i) ??
    take(new RegExp(String.raw`[\s,]+(?:[àa]s|para as|pras|at[ée] as)\s+(${NUM})(?:\s+horas?)?()(?:\s+e\s+(meia))?(?:\s+(?:da|de)\s+(manh[ãa]|tarde|noite|madrugada))(?=[\s,.]|$)`, "i")) ??
    take(new RegExp(String.raw`[\s,]+(?:[àa]s|para as|pras|at[ée] as)\s+(${NUM})\s+horas?()(?:\s+e\s+(meia))?()(?=[\s,.]|$)`, "i")) ??
    take(/[\s,]+(\d{1,2})(?::|h)(\d{2})?(?:\s+(?:da|de)\s+(manh[ãa]|tarde|noite))?(?=[\s,.]|$)/i)
  const noonMatch = !timeMatch && take(/[\s,]+(?:ao|[àa]s?)?\s*(meio[- ]dia|meia[- ]noite)(?=[\s,.]|$)/i)
  if (timeMatch) {
    const isFirstForm = timeMatch.length > 4
    let hour = toNumber(timeMatch[1])
    let minute = Number(timeMatch[2] ?? 0)
    const extra = isFirstForm ? timeMatch[3] : undefined
    const period = (isFirstForm ? timeMatch[4] : timeMatch[3])?.toLowerCase()
    if (extra) minute = extra === "meia" ? 30 : Number(extra)
    if (period && /tarde|noite/.test(period) && hour < 12) hour += 12
    if (hour <= 23 && minute <= 59) {
      dueTime = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
      found.time = true
    }
  } else if (noonMatch) {
    dueTime = /meio/i.test(noonMatch[1]) ? "12:00" : "00:00"
    found.time = true
  }

  // 5. Data
  const today = startOfDay(now)
  const relative = take(/[\s,]+(?:para\s+|pra\s+|at[ée]\s+)?(depois de amanh[ãa]|amanh[ãa]|hoje)(?:\s+[àa]\s+(?:noite|tarde))?(?=[\s,.]|$)/i)
  if (relative) {
    const word = stripAccents(relative[1].toLowerCase())
    dueDate = addDays(today, word.startsWith("depois") ? 2 : word === "amanha" ? 1 : 0)
  }

  if (!dueDate) {
    const weekday = take(/[\s,]+(?:para\s+|pra\s+|at[ée]\s+)?(?:(?:na|no|nesta|neste|esta|este|essa|esse)\s+)?(?:(?:pr[óo]xim[ao])\s+)?(segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado|domingo)(?:[- ]feira)?(?:\s+que\s+vem)?(?=[\s,.]|$)/i)
    if (weekday) {
      const day = WEEKDAYS.find(([re]) => re.test(weekday[1].toLowerCase()))![1]
      dueDate = nextDay(today, day)
    }
  }

  if (!dueDate) {
    const inN = take(new RegExp(String.raw`[\s,]+(?:daqui a|em|dentro de)\s+(${NUM})\s+(dias?|semanas?|m[êe]s|meses)(?=[\s,.]|$)`, "i"))
    if (inN) {
      const n = toNumber(inN[1])
      const unit = inN[2].toLowerCase()
      dueDate = unit.startsWith("dia")
        ? addDays(today, n)
        : unit.startsWith("semana")
          ? addWeeks(today, n)
          : addMonths(today, n)
    }
  }

  if (!dueDate) {
    const nextWeek = take(/[\s,]+(?:para\s+|pra\s+|at[ée]\s+)?(?:a\s+|na\s+|no\s+)?(semana que vem|pr[óo]xima semana|m[êe]s que vem|pr[óo]ximo m[êe]s)(?=[\s,.]|$)/i)
    if (nextWeek) {
      dueDate = /semana/i.test(nextWeek[1])
        ? nextDay(today, 1)
        : addMonths(today, 1)
    }
  }

  if (!dueDate) {
    const explicit =
      take(new RegExp(String.raw`[\s,]+(?:para\s+|pra\s+|at[ée]\s+)?(?:o\s+|no\s+)?dia\s+(${NUM}|primeiro)(?:\s+de\s+(${MONTH}))?(?:\s+de\s+(\d{4}))?(?=[\s,.]|$)`, "i")) ??
      take(new RegExp(String.raw`[\s,]+(?:para\s+|pra\s+|at[ée]\s+|em\s+)?(\d{1,2})\s+de\s+(${MONTH})(?:\s+de\s+(\d{4}))?(?=[\s,.]|$)`, "i"))
    const numeric = !explicit && take(/[\s,]+(?:para\s+|pra\s+|at[ée]\s+|em\s+|dia\s+)?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?=[\s,.]|$)/)
    if (explicit || numeric) {
      const m = (explicit || numeric) as RegExpMatchArray
      const day = m[1].toLowerCase() === "primeiro" ? 1 : toNumber(m[1])
      const month = explicit
        ? m[2] !== undefined ? MONTHS[m[2].toLowerCase()] : null
        : Number(m[2]) - 1
      const yearRaw = m[3] ? Number(m[3]) : null
      const year = yearRaw && yearRaw < 100 ? 2000 + yearRaw : yearRaw
      let candidate = new Date(year ?? today.getFullYear(), month ?? today.getMonth(), day)
      if (!year && isBefore(candidate, today)) {
        candidate = month === null ? addMonths(candidate, 1) : new Date(candidate.getFullYear() + 1, month, day)
      }
      if (candidate.getDate() === day) dueDate = candidate
    }
  }

  // Só hora: hoje se ainda não passou, senão amanhã
  if (!dueDate && dueTime) {
    const [h, min] = dueTime.split(":").map(Number)
    const at = new Date(today)
    at.setHours(h, min)
    dueDate = isBefore(at, now) ? addDays(today, 1) : today
  }
  if (dueDate) found.date = true

  // 6. O que sobrou é o título
  let title = text
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .trim()
  const connector = /(?:^|[\s,;:]+)(?:para|pra|at[ée]|no|na|em|de|do|da|e|que|com)?[\s,;:]*$/i
  for (let i = 0; i < 3; i++) title = title.replace(connector, "").trim()
  title = title.replace(/^[,;:\s]+/, "")
  if (!title) title = input.trim()
  title = title.charAt(0).toUpperCase() + title.slice(1)

  return {
    draft: {
      title,
      description,
      dueDate: dueDate ? format(dueDate, "yyyy-MM-dd") : null,
      dueTime: dueDate ? dueTime : null,
      priority,
    },
    found,
  }
}
