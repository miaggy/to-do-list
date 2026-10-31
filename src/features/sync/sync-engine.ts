import type { RealtimeChannel } from "@supabase/supabase-js"
import { create } from "zustand"

import { supabase } from "@/lib/supabase"

import { db } from "../tasks/db"
import type { Priority, Task, TaskSource } from "../tasks/types"

/**
 * Sincronização local-first entre o IndexedDB (Dexie) e o Supabase.
 *
 * - Toda escrita local vai para o Dexie e para a fila "outbox".
 * - push: envia a fila (upsert); o servidor ignora versões mais antigas.
 * - pull: busca o que mudou desde o último cursor (server_updated_at).
 * - realtime: mudanças de outros aparelhos chegam na hora.
 * Conflitos: vence a edição mais recente (updated_at).
 */

export type SyncStatus = "off" | "syncing" | "synced" | "offline" | "error"

export const useSyncStatus = create<{ status: SyncStatus; lastSyncedAt: string | null }>(() => ({
  status: "off",
  lastSyncedAt: null,
}))

interface TaskRow {
  id: string
  title: string
  description: string
  due_date: string | null
  due_time: string | null
  priority: Priority
  completed: boolean
  completed_at: string | null
  source: TaskSource
  created_at: string
  updated_at: string
  deleted_at: string | null
  server_updated_at: string
}

const OWNER_KEY = "owner"
const cursorKey = (userId: string) => `cursor:${userId}`
const PAGE_SIZE = 500

/** Normaliza o formato de data do Postgres para o ISO usado localmente. */
function iso(value: string | null) {
  return value ? new Date(value).toISOString() : null
}

function toRow(task: Task) {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    due_date: task.dueDate,
    due_time: task.dueTime,
    priority: task.priority,
    completed: task.completed,
    completed_at: task.completedAt,
    source: task.source,
    created_at: task.createdAt,
    updated_at: task.updatedAt,
    deleted_at: task.deletedAt,
  }
}

function fromRow(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    dueDate: row.due_date,
    dueTime: row.due_time,
    priority: row.priority,
    completed: row.completed,
    completedAt: iso(row.completed_at),
    source: row.source,
    createdAt: iso(row.created_at)!,
    updatedAt: iso(row.updated_at)!,
    deletedAt: iso(row.deleted_at),
  }
}

/** Aplica uma versão vinda da nuvem, a menos que a local seja mais nova. */
async function applyRemote(row: TaskRow) {
  const remote = fromRow(row)
  await db.transaction("rw", db.tasks, db.outbox, async () => {
    const pending = await db.outbox.get(remote.id)
    if (pending && pending.updatedAt > remote.updatedAt) return
    if (pending) await db.outbox.delete(remote.id)
    if (remote.deletedAt) await db.tasks.delete(remote.id)
    else await db.tasks.put(remote)
  })
}

let userId: string | null = null
let channel: RealtimeChannel | null = null
let running: Promise<void> | null = null
let again = false
let timer: number | undefined

async function push() {
  if (!supabase) return
  const entries = await db.outbox.toArray()
  for (let i = 0; i < entries.length; i += PAGE_SIZE) {
    const batch = entries.slice(i, i + PAGE_SIZE)
    const tasks = (await db.tasks.bulkGet(batch.map((e) => e.id))).filter(
      (task): task is Task => !!task
    )
    if (tasks.length) {
      const { error } = await supabase.from("tasks").upsert(tasks.map(toRow))
      if (error) throw error
    }
    // Remove da fila só o que não mudou durante o envio; exclusões já
    // confirmadas na nuvem podem sair do aparelho
    await db.transaction("rw", db.tasks, db.outbox, async () => {
      for (const entry of batch) {
        const current = await db.outbox.get(entry.id)
        if (current?.updatedAt !== entry.updatedAt) continue
        await db.outbox.delete(entry.id)
        const task = await db.tasks.get(entry.id)
        if (task?.deletedAt) await db.tasks.delete(entry.id)
      }
    })
  }
}

async function pull(user: string) {
  if (!supabase) return
  for (;;) {
    const cursor = (await db.meta.get(cursorKey(user)))?.value ?? "1970-01-01T00:00:00Z"
    const { data, error } = await supabase
      .from("tasks")
      .select("*")
      .gt("server_updated_at", cursor)
      .order("server_updated_at", { ascending: true })
      .limit(PAGE_SIZE)
    if (error) throw error
    const rows = data as TaskRow[]
    for (const row of rows) await applyRemote(row)
    if (rows.length) {
      await db.meta.put({ key: cursorKey(user), value: rows.at(-1)!.server_updated_at })
    }
    if (rows.length < PAGE_SIZE) return
  }
}

async function runSync() {
  const user = userId
  if (!user || !supabase) return
  if (!navigator.onLine) {
    useSyncStatus.setState({ status: "offline" })
    return
  }
  useSyncStatus.setState({ status: "syncing" })
  try {
    await push()
    await pull(user)
    if (user === userId) {
      useSyncStatus.setState({ status: "synced", lastSyncedAt: new Date().toISOString() })
    }
  } catch (error) {
    console.error("[sync]", error)
    useSyncStatus.setState({ status: navigator.onLine ? "error" : "offline" })
  }
}

/** Sincroniza agora; chamadas durante uma sincronização disparam mais uma rodada. */
export function syncNow() {
  if (!userId) return Promise.resolve()
  if (running) {
    again = true
    return running
  }
  running = (async () => {
    do {
      again = false
      await runSync()
    } while (again)
  })().finally(() => {
    running = null
  })
  return running
}

/** Agenda uma sincronização logo após mudanças locais (agrupa várias). */
export function requestSync() {
  if (!userId) return
  window.clearTimeout(timer)
  timer = window.setTimeout(() => void syncNow(), 300)
}

const onOnline = () => void syncNow()
const onVisible = () => document.visibilityState === "visible" && void syncNow()

/**
 * Liga a sincronização para o usuário logado. Na primeira vez, as tarefas que
 * já existiam no aparelho são enviadas para a conta; se o aparelho tinha dados
 * de outra conta, eles são descartados.
 */
export async function startSync(user: string) {
  if (!supabase || userId === user) return
  stopSync()

  const owner = (await db.meta.get(OWNER_KEY))?.value
  if (!owner) {
    const tasks = await db.tasks.toArray()
    await db.outbox.bulkPut(tasks.map((t) => ({ id: t.id, updatedAt: t.updatedAt })))
    await db.meta.put({ key: OWNER_KEY, value: user })
  } else if (owner !== user) {
    await clearLocalData()
    await db.meta.put({ key: OWNER_KEY, value: user })
  }

  userId = user
  channel = supabase
    .channel(`tasks:${user}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "tasks", filter: `user_id=eq.${user}` },
      (payload) => {
        if (payload.eventType === "DELETE") {
          void db.tasks.delete((payload.old as { id: string }).id)
          return
        }
        void applyRemote(payload.new as TaskRow)
      }
    )
    .subscribe((status) => {
      // Ao (re)conectar, busca o que pode ter passado enquanto estava fora
      if (status === "SUBSCRIBED") void syncNow()
    })

  window.addEventListener("online", onOnline)
  document.addEventListener("visibilitychange", onVisible)
  await syncNow()
}

export function stopSync() {
  userId = null
  window.clearTimeout(timer)
  window.removeEventListener("online", onOnline)
  document.removeEventListener("visibilitychange", onVisible)
  if (channel) void supabase?.removeChannel(channel)
  channel = null
  useSyncStatus.setState({ status: "off", lastSyncedAt: null })
}

/** Apaga as tarefas deste aparelho (ao sair da conta). */
export async function clearLocalData() {
  await db.transaction("rw", db.tasks, db.outbox, db.meta, async () => {
    await db.tasks.clear()
    await db.outbox.clear()
    await db.meta.clear()
  })
}
