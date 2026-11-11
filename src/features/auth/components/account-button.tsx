import { format } from "date-fns"
import {
  CloudAlertIcon,
  CloudCheckIcon,
  CloudIcon,
  CloudOffIcon,
  LogOutIcon,
  RefreshCwIcon,
} from "lucide-react"
import { useState, type FormEvent } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

import { syncNow, useSyncStatus, type SyncStatus } from "../../sync/sync-engine"
import { connectWithKey, disconnect, useAuth } from "../auth-store"

const STATUS_TEXT: Record<SyncStatus, string> = {
  off: "Sincronização desligada",
  syncing: "Sincronizando…",
  synced: "Sincronizado",
  offline: "Sem internet. As mudanças serão enviadas quando a conexão voltar.",
  error: "Não foi possível sincronizar. Tentaremos de novo.",
}

function StatusIcon({ status, connected }: { status: SyncStatus; connected: boolean }) {
  const className = "size-5"
  if (!connected) return <CloudIcon className={className} />
  if (status === "syncing") return <RefreshCwIcon className={cn(className, "animate-spin")} />
  if (status === "synced") return <CloudCheckIcon className={className} />
  if (status === "offline") return <CloudOffIcon className={className} />
  if (status === "error") return <CloudAlertIcon className={cn(className, "text-destructive")} />
  return <CloudIcon className={className} />
}

function errorMessage(error: unknown) {
  const message = (error as Error)?.message ?? ""
  if (/invalid login credentials/i.test(message)) return "Chave incorreta."
  if (/rate limit|too many/i.test(message)) return "Muitas tentativas. Aguarde um pouco."
  if (/fetch|network/i.test(message)) return "Não foi possível conectar. Verifique a internet."
  return "Algo deu errado. Tente de novo."
}

function KeyForm() {
  const [key, setKey] = useState("")
  const [busy, setBusy] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!key) return
    setBusy(true)
    try {
      await connectWithKey(key)
      toast.success("Pronto! Suas tarefas agora sincronizam.")
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="sync-key">Chave de sincronização</Label>
        <Input
          id="sync-key"
          type="password"
          autoComplete="current-password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
        />
      </div>
      <Button type="submit" disabled={busy || !key}>
        Sincronizar este aparelho
      </Button>
    </form>
  )
}

function ConnectedDetails() {
  const { status, lastSyncedAt } = useSyncStatus()
  const [busy, setBusy] = useState(false)

  const statusText =
    status === "synced" && lastSyncedAt
      ? `Sincronizado às ${format(new Date(lastSyncedAt), "HH:mm")}`
      : STATUS_TEXT[status]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 rounded-2xl bg-muted p-4">
        <StatusIcon status={status} connected />
        <div className="min-w-0">
          <p className="text-sm font-medium">Este aparelho está sincronizado</p>
          <p className="text-xs text-muted-foreground">{statusText}</p>
        </div>
      </div>
      <Button variant="outline" disabled={status === "syncing"} onClick={() => void syncNow()}>
        <RefreshCwIcon />
        Sincronizar agora
      </Button>
      <Button
        variant="ghost"
        className="text-destructive hover:text-destructive"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          await disconnect()
          setBusy(false)
          toast("Aparelho desconectado. As tarefas continuam salvas na nuvem.")
        }}
      >
        <LogOutIcon />
        Desconectar este aparelho
      </Button>
    </div>
  )
}

/** Botão no topo: mostra o estado da sincronização e abre a chave/detalhes. */
export function AccountButton() {
  const authStatus = useAuth((s) => s.status)
  const syncStatus = useSyncStatus((s) => s.status)
  const [open, setOpen] = useState(false)

  if (authStatus === "disabled") return null
  const connected = authStatus === "signed-in"

  return (
    <>
      <button
        type="button"
        aria-label={connected ? "Sincronização" : "Ativar sincronização"}
        onClick={() => setOpen(true)}
        className={cn(
          "flex h-11 items-center gap-2 rounded-full border bg-card px-3 text-sm text-muted-foreground transition-colors hover:text-foreground",
          !connected && authStatus !== "loading" && "text-foreground"
        )}
      >
        <StatusIcon status={syncStatus} connected={connected} />
        {!connected && authStatus !== "loading" && <span>Sincronizar</span>}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-2xl font-semibold tracking-tight">{connected ? "Sincronização" : "Sincronizar tarefas"}</DialogTitle>
            <DialogDescription>
              {connected
                ? "Suas tarefas ficam salvas na nuvem e iguais em todos os aparelhos."
                : "Digite a chave uma vez neste aparelho. Depois a sincronização é automática."}
            </DialogDescription>
          </DialogHeader>
          {connected ? <ConnectedDetails /> : <KeyForm />}
        </DialogContent>
      </Dialog>
    </>
  )
}
