import { createClient } from "@supabase/supabase-js"

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/**
 * E-mail fixo da conta de sincronização, igual para todos os aparelhos. Não é
 * segredo: quem protege os dados é a chave de sincronização (a senha da conta).
 */
export const SYNC_EMAIL =
  (import.meta.env.VITE_SYNC_EMAIL as string | undefined) ?? "tarefas@example.com"

/**
 * Cliente do Supabase. Fica null enquanto o projeto não estiver configurado
 * (.env), e aí o app funciona só com os dados locais.
 */
export const supabase = url && anonKey ? createClient(url, anonKey) : null

export async function getAccessToken() {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}
