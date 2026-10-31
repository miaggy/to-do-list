import type { User } from "@supabase/supabase-js"
import { create } from "zustand"

import { SYNC_EMAIL, supabase } from "@/lib/supabase"

import { clearLocalData, startSync, stopSync, syncNow } from "../sync/sync-engine"

interface AuthState {
  /** "loading" até sabermos se há sessão salva. */
  status: "disabled" | "loading" | "signed-out" | "signed-in"
  user: User | null
}

export const useAuth = create<AuthState>(() => ({
  status: supabase ? "loading" : "disabled",
  user: null,
}))

/**
 * Liga a sincronização neste aparelho. Todos os aparelhos entram na mesma conta
 * do Supabase (e-mail fixo); a chave de sincronização é a senha dessa conta.
 * Depois da primeira vez a sessão fica salva e renova sozinha.
 */
export async function connectWithKey(key: string) {
  if (!supabase) throw new Error("Supabase não configurado")
  const { error } = await supabase.auth.signInWithPassword({ email: SYNC_EMAIL, password: key })
  if (error) throw error
}

export async function disconnect() {
  if (!supabase) return
  // Tenta mandar o que estiver pendente antes de limpar o aparelho
  await syncNow().catch(() => undefined)
  stopSync()
  await supabase.auth.signOut()
  await clearLocalData()
}

if (supabase) {
  supabase.auth.onAuthStateChange((_event, session) => {
    const user = session?.user ?? null
    useAuth.setState({ status: user ? "signed-in" : "signed-out", user })
    // Fora do callback: o supabase-js recomenda não aguardar chamadas aqui dentro
    setTimeout(() => {
      if (user) void startSync(user.id)
      else stopSync()
    })
  })
}
