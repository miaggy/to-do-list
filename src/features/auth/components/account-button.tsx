import { format } from "date-fns"
import {
  CloudAlertIcon,
  CloudCheckIcon,
  CloudOffIcon,
  CloudIcon,
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
import { sendLoginEmail, signOut, useAuth, verifyLoginCode } from "../auth-store"

const STATUS_TEXT: Record<SyncStatus, string> = {
  off: "Sincronização desligada",
  syncing: "Sincronizando…",
  synced: "Sincronizado",
  offline: "Sem internet. As mudanças serão enviadas quando a conexão voltar.",
  error: "Não foi possível sincronizar. Tentaremos de novo.",
}

function StatusIcon({ status, signedIn }: { status: SyncStatus; signedIn: boolean }) {
  const className = "size-5"
  if (!signedIn) return <CloudIcon className={className} />
  if (status === "syncing") return <RefreshCwIcon className={cn(className, "animate-spin")} />
  if (status === "synced") return <CloudCheckIcon className={className} />
  if (status === "offline") return <CloudOffIcon className={className} />
  if (status === "error") return <CloudAlertIcon className={cn(className, "text-destructive")} />
  return <CloudIcon className={className} />
}

function errorMessage(error: unknown) {
  const message = (error as Error)?.message ?? ""
  // Limite por hora do serviço de e-mail do Supabase
  if (/email rate limit/i.test(message))
    return "Limite de e-mails por hora atingido. Use o último e-mail recebido ou tente mais tarde."
  // Intervalo mínimo entre dois pedidos do mesmo e-mail
  if (/rate limit|security purposes/i.test(message))
    return "Aguarde um minuto antes de pedir outro e-mail."
  if (/expired|invalid/i.test(message)) return "Código inválido ou expirado."
  return "Algo deu errado. Tente de novo."
}

function SignInForm() {
  const [email, setEmail] = useState("")
  const [code, setCode] = useState("")
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSend(event: FormEvent) {
    event.preventDefault()
    const value = email.trim()
    if (!value) return
    setBusy(true)
    try {
      await sendLoginEmail(value)
      setSentTo(value)
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function onVerify(event: FormEvent) {
    event.preventDefault()
    if (!sentTo || !code.trim()) return
    setBusy(true)
    try {
      await verifyLoginCode(sentTo, code.trim())
      toast.success("Pronto! Suas tarefas agora sincronizam.")
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  if (sentTo) {
    return (
      <form onSubmit={onVerify} className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          Enviamos um e-mail para <span className="text-foreground">{sentTo}</span>. Abra o link
          neste aparelho ou digite o código do e-mail.
        </p>
        <div className="flex flex-col gap-2">
          <Label htmlFor="otp">Código</Label>
          <Input
            id="otp"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            maxLength={10}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            className="text-center text-lg tracking-[0.3em]"
          />
        </div>
        <Button type="submit" disabled={busy || code.length < 6}>
          Entrar
        </Button>
        <Button type="button" variant="ghost" onClick={() => setSentTo(null)}>
          Usar outro e-mail
        </Button>
      </form>
    )
  }

  return (
    <form onSubmit={onSend} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">E-mail</Label>
        <Input
          id="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="voce@exemplo.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>
      <Button type="submit" disabled={busy}>
        Enviar link de acesso
      </Button>
    </form>
  )
}

function AccountDetails() {
  const user = useAuth((s) => s.user)
  const { status, lastSyncedAt } = useSyncStatus()
  const [busy, setBusy] = useState(false)

  const statusText =
    status === "synced" && lastSyncedAt
      ? `Sincronizado às ${format(new Date(lastSyncedAt), "HH:mm")}`
      : STATUS_TEXT[status]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 rounded-xl border p-3">
        <StatusIcon status={status} signedIn />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{user?.email}</p>
          <p className="text-xs text-muted-foreground">{statusText}</p>
        </div>
      </div>
      <Button
        variant="outline"
        disabled={status === "syncing"}
        onClick={() => void syncNow()}
      >
        <RefreshCwIcon />
        Sincronizar agora
      </Button>
      <Button
        variant="ghost"
        className="text-destructive hover:text-destructive"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          await signOut()
          setBusy(false)
          toast("Você saiu. As tarefas continuam salvas na sua conta.")
        }}
      >
        <LogOutIcon />
        Sair deste aparelho
      </Button>
    </div>
  )
}

/** Botão de conta no topo: mostra o estado da sincronização e abre login/conta. */
export function AccountButton() {
  const authStatus = useAuth((s) => s.status)
  const syncStatus = useSyncStatus((s) => s.status)
  const [open, setOpen] = useState(false)

  if (authStatus === "disabled") return null
  const signedIn = authStatus === "signed-in"

  return (
    <>
      <button
        type="button"
        aria-label={signedIn ? "Conta e sincronização" : "Entrar para sincronizar"}
        onClick={() => setOpen(true)}
        className={cn(
          "flex h-11 items-center gap-2 rounded-full border bg-card px-3 text-sm text-muted-foreground transition-colors hover:text-foreground",
          !signedIn && authStatus !== "loading" && "text-foreground"
        )}
      >
        <StatusIcon status={syncStatus} signedIn={signedIn} />
        {!signedIn && authStatus !== "loading" && <span>Entrar</span>}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{signedIn ? "Sua conta" : "Sincronizar tarefas"}</DialogTitle>
            <DialogDescription>
              {signedIn
                ? "Suas tarefas ficam salvas na nuvem e iguais em todos os aparelhos."
                : "Entre com seu e-mail para ter as mesmas tarefas em todos os aparelhos."}
            </DialogDescription>
          </DialogHeader>
          {signedIn ? <AccountDetails /> : <SignInForm />}
        </DialogContent>
      </Dialog>
    </>
  )
}
