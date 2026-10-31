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

const WORDS = Object.keys(NUMBER_WORDS).join("|")
const NUM = String.raw`\d{1,2}|${WORDS}`

/** Minutos falados depois da hora: "três e quinze", "oito e meia". */
const MINUTE_WORDS: [string, number][] = [
  ["cinquenta e cinco", 55], ["cinquenta", 50], ["quarenta e cinco", 45], ["quarenta", 40],
  ["trinta e cinco", 35], ["trinta", 30], ["vinte e cinco", 25], ["vinte", 20],
  ["quinze", 15], ["dez", 10], ["cinco", 5], ["meia", 30],
]
const MINUTE_RE = MINUTE_WORDS.map(([word]) => word).join("|")

/** "às 10", "às 10h30", "às 14 horas e 30 minutos", "às oito e meia da noite"… */
const TIME_RE = new RegExp(
  String.raw`[\s,]+(?:[àa]s|[àa](?=\s+uma\b)|para as|pras|at[ée] as)\s+(?<hour>${NUM})(?:\s*(?::|h)\s*(?<min>\d{2}))?(?:\s*(?<unit>h(?:oras?)?|hrs?))?(?:\s+e\s+(?<extra>${MINUTE_RE}|\d{1,2})(?:\s+minutos?)?)?(?:\s+em ponto)?(?:\s+(?:da|de|pela)\s+(?<period>manh[ãa]|tarde|noite|madrugada))?(?=[\s,.]|$)`,
  "i"
)
/** Sem "às": "amanhã 14h", "10:30". */
const BARE_TIME_RE =
  /[\s,]+(?<hour>\d{1,2})(?::(?<min>\d{2})|h(?:\s*(?<min2>\d{2}))?)(?:\s+(?:da|de|pela)\s+(?<period>manh[ãa]|tarde|noite|madrugada))?(?=[\s,.]|$)/i
/** Hora por extenso ("às sete") só vale se o que vem depois parecer fim de hora. */
const WORD_HOUR_END_RE =
  /^\s*(?:$|[,.;]|(?:amanh|hoje|depois|segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado|domingo|dia\b|prioridade|descri|detalhes|obs))/i

/** Horário assumido quando só se diz o período do dia. */
const DAY_PERIOD_TIME: Record<string, string> = { manha: "09:00", tarde: "15:00", noite: "20:00" }
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

  // 4. Hora
  // Daqui a pouco: "daqui a 2 horas", "em 30 minutos", "daqui a meia hora"
  const relTime = take(
    new RegExp(
      String.raw`[\s,]+(?:daqui a|dentro de|em)\s+(?:(meia)\s+hora|(\d{1,3}|${WORDS})\s+(horas?|minutos?)(?:\s+e\s+(meia))?)(?=[\s,.]|$)`,
      "i"
    )
  )
  if (relTime) {
    const minutes = relTime[1]
      ? 30
      : toNumber(relTime[2]) * (/^h/i.test(relTime[3]) ? 60 : 1) + (relTime[4] ? 30 : 0)
    const at = new Date(now.getTime() + minutes * 60_000)
    dueDate = startOfDay(at)
    dueTime = format(at, "HH:mm")
    found.time = true
  }

  if (!relTime) {
    const withPrefix = text.match(TIME_RE)
    const bare = withPrefix ? null : text.match(BARE_TIME_RE)
    const match = withPrefix ?? bare
    if (match?.groups) {
      const { hour: hourRaw, min, min2, unit, extra, period } = match.groups
      const rest = text.slice(match.index! + match[0].length)
      // "ligar às duas clientes" não é hora; "às sete amanhã" é
      const spoken = !/^\d/.test(hourRaw)
      if (!spoken || unit || extra || period || WORD_HOUR_END_RE.test(rest)) {
        let hour = toNumber(hourRaw)
        let minute = Number(min ?? min2 ?? 0)
        if (extra) {
          minute = /^\d/.test(extra)
            ? Number(extra)
            : (MINUTE_WORDS.find(([word]) => word === extra.toLowerCase())?.[1] ?? 0)
        }
        const day = stripAccents(period?.toLowerCase() ?? "")
        if ((day === "tarde" || day === "noite") && hour < 12) hour += 12
        if (day === "madrugada" && hour === 12) hour = 0
        if (hour <= 23 && minute <= 59) {
          dueTime = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
          found.time = true
          text = text.replace(match[0], " ")
        }
      }
    }
  }

  if (!dueTime) {
    const noon = take(/[\s,]+(?:ao|[àa]s?)?\s*(meio[- ]dia|meia[- ]noite)(?=[\s,.]|$)/i)
    if (noon) {
      dueTime = /meio/i.test(noon[1]) ? "12:00" : "00:00"
      found.time = true
    }
  }

  // Só o período do dia: "amanhã de manhã", "hoje à noite"
  if (!dueTime) {
    const dayPeriod = take(/[\s,]+(?:de|pela|na|da|[àa])\s+(manh[ãa]|tarde|noite)(?=[\s,.]|$)/i)
    if (dayPeriod) {
      dueTime = DAY_PERIOD_TIME[stripAccents(dayPeriod[1].toLowerCase())]
      found.time = true
    }
  }

  // 5. Data
  const today = startOfDay(now)
  const relative = dueDate
    ? null
    : take(/[\s,]+(?:para\s+|pra\s+|at[ée]\s+|de\s+)?(depois de amanh[ãa]|amanh[ãa]|hoje)(?=[\s,.]|$)/i)
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
