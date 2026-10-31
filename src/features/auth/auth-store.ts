import type { User } from "@supabase/supabase-js"
import { create } from "zustand"

import { supabase } from "@/lib/supabase"

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

function redirectUrl() {
  return new URL(import.meta.env.BASE_URL, window.location.origin).toString()
}

/** Envia o e-mail com link mágico (e código, se o template incluir {{ .Token }}). */
export async function sendLoginEmail(email: string) {
  if (!supabase) throw new Error("Supabase não configurado")
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectUrl() },
  })
  if (error) throw error
}

export async function verifyLoginCode(email: string, token: string) {
  if (!supabase) throw new Error("Supabase não configurado")
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" })
  if (error) throw error
}

export async function signOut() {
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
