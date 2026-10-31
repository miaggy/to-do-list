import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Supabase falso em memória: imita a tabela tasks, o trigger que ignora
 * versões antigas e marca server_updated_at, e o canal de tempo real.
 */
const server = vi.hoisted(() => {
  type Row = Record<string, unknown> & { id: string; updated_at: string; server_updated_at?: string }
  const rows = new Map<string, Row>()
  let clock = 0
  const tick = () => new Date(Date.UTC(2026, 0, 1, 0, 0, 0, ++clock)).toISOString()

  const write = (row: Row) => {
    const current = rows.get(row.id)
    if (current && new Date(row.updated_at) < new Date(current.updated_at)) return
    rows.set(row.id, { ...current, ...row, server_updated_at: tick() })
  }

  const client = {
    from: () => ({
      upsert: async (input: Row[]) => {
        input.forEach(write)
        return { error: null }
      },
      select: () => {
        let cursor = ""
        let limit = Infinity
        const query = {
          gt: (_col: string, value: string) => ((cursor = value), query),
          order: () => query,
          limit: async (n: number) => {
            limit = n
            const data = [...rows.values()]
              .filter((r) => r.server_updated_at! > cursor)
              .sort((a, b) => (a.server_updated_at! < b.server_updated_at! ? -1 : 1))
              .slice(0, limit)
            return { data, error: null }
          },
        }
        return query
      },
    }),
    channel: () => {
      const channel = {
        on: () => channel,
        subscribe: () => channel,
      }
      return channel
    },
    removeChannel: async () => undefined,
  }
  return { rows, write, client }
})

vi.mock("@/lib/supabase", () => ({ supabase: server.client, getAccessToken: async () => null }))

const { db } = await import("../tasks/db")
const repo = await import("../tasks/repository")
const sync = await import("./sync-engine")

const draft = {
  title: "Pagar luz",
  description: "",
  dueDate: null,
  dueTime: null,
  priority: "high" as const,
}

function remoteRow(id: string, title: string, updatedAt: string, deletedAt: string | null = null) {
  return {
    id,
    title,
    description: "",
    due_date: null,
    due_time: null,
    priority: "none",
    completed: false,
    completed_at: null,
    source: "manual",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: updatedAt,
    deleted_at: deletedAt,
  }
}

beforeEach(async () => {
  sync.stopSync()
  server.rows.clear()
  await sync.clearLocalData()
})

describe("sincronização", () => {
  it("envia para a conta as tarefas que já existiam antes do login", async () => {
    await repo.createTask(draft, "manual")
    await sync.startSync("user-a")

    expect([...server.rows.values()].map((r) => r.title)).toEqual(["Pagar luz"])
    expect(await db.outbox.count()).toBe(0)
  })

  it("traz tarefas criadas em outro aparelho", async () => {
    server.write(remoteRow("t1", "Do celular", "2026-01-01T10:00:00.000Z"))
    await sync.startSync("user-a")

    expect((await db.tasks.get("t1"))?.title).toBe("Do celular")
  })

  it("envia edições locais e aplica edições remotas mais novas", async () => {
    await sync.startSync("user-a")
    const task = await repo.createTask(draft, "manual")
    await sync.syncNow()

    server.write({ ...remoteRow(task.id, "Editado no PC", "2099-01-01T00:00:00.000Z") })
    await sync.syncNow()
    expect((await db.tasks.get(task.id))?.title).toBe("Editado no PC")
  })

  it("mantém a edição local quando ela é mais nova que a remota", async () => {
    server.write(remoteRow("t1", "Antiga", "2026-01-01T10:00:00.000Z"))
    await sync.startSync("user-a")
    sync.stopSync()

    // Editado offline aqui; outro aparelho mandou uma versão mais antiga depois
    await repo.updateTask("t1", { ...draft, title: "Nova local" })
    server.write({ ...remoteRow("t1", "Antiga", "2026-01-01T10:00:00.000Z"), title: "Antiga 2" })
    await sync.startSync("user-a")

    expect((await db.tasks.get("t1"))?.title).toBe("Nova local")
    expect(server.rows.get("t1")?.title).toBe("Nova local")
  })

  it("propaga exclusões e permite desfazer", async () => {
    await sync.startSync("user-a")
    const task = await repo.createTask(draft, "manual")
    await sync.syncNow()

    const removed = await repo.deleteTask(task.id)
    await sync.syncNow()
    expect(server.rows.get(task.id)?.deleted_at).toBeTruthy()
    expect(await db.tasks.get(task.id)).toBeUndefined()

    await repo.restoreTask(removed!)
    await sync.syncNow()
    expect(server.rows.get(task.id)?.deleted_at).toBeNull()
    expect((await db.tasks.get(task.id))?.deletedAt).toBeNull()
  })

  it("remove do aparelho o que foi excluído em outro", async () => {
    server.write(remoteRow("t1", "Vai sumir", "2026-01-01T10:00:00.000Z"))
    await sync.startSync("user-a")
    server.write(remoteRow("t1", "Vai sumir", "2026-01-02T10:00:00.000Z", "2026-01-02T10:00:00.000Z"))
    await sync.syncNow()

    expect(await db.tasks.get("t1")).toBeUndefined()
  })

  it("descarta dados de outra conta ao trocar de usuário", async () => {
    await sync.startSync("user-a")
    await repo.createTask(draft, "manual")
    await sync.syncNow()
    sync.stopSync()
    server.rows.clear()

    await sync.startSync("user-b")
    expect(await db.tasks.count()).toBe(0)
  })
})
