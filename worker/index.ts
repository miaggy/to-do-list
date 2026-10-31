/**
 * Worker do Cloudflare: serve o app (assets estáticos) e a API em /api/*.
 *
 * /api/transcribe recebe o áudio gravado no navegador e repassa para um serviço
 * de transcrição compatível com a API da OpenAI (OpenAI, Groq…). A chave fica
 * só aqui, como secret do Worker.
 */

interface Env {
  ASSETS: Fetcher
  SUPABASE_URL?: string
  SUPABASE_ANON_KEY?: string
  TRANSCRIBE_API_KEY?: string
  TRANSCRIBE_BASE_URL?: string
  TRANSCRIBE_MODEL?: string
  /** "true" libera a transcrição sem login (só para desenvolvimento). */
  ALLOW_ANONYMOUS_TRANSCRIBE?: string
}

const MAX_AUDIO_BYTES = 10 * 1024 * 1024

const PROMPT =
  "Ditado de uma tarefa em português do Brasil, com datas, horários e prioridade. " +
  "Ex.: Pagar a conta de luz amanhã às 10, prioridade alta, descrição vence dia 5."

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } })
}

/** Confere o token do Supabase enviado pelo app. */
async function isAuthorized(request: Request, env: Env) {
  if (env.ALLOW_ANONYMOUS_TRANSCRIBE === "true") return true
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return false
  const auth = request.headers.get("authorization")
  if (!auth?.startsWith("Bearer ")) return false
  const response = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_ANON_KEY, authorization: auth },
  })
  return response.ok
}

async function transcribe(request: Request, env: Env) {
  if (!env.TRANSCRIBE_API_KEY) return json({ error: "not-configured" }, 503)
  if (!(await isAuthorized(request, env))) return json({ error: "unauthorized" }, 401)

  const form = await request.formData()
  const audio = form.get("audio")
  if (!(audio instanceof File) || audio.size === 0) return json({ error: "no-audio" }, 400)
  if (audio.size > MAX_AUDIO_BYTES) return json({ error: "too-large" }, 413)

  const upstream = new FormData()
  upstream.append("file", audio, audio.name || "audio.webm")
  upstream.append("model", env.TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe")
  upstream.append("language", "pt")
  upstream.append("prompt", PROMPT)
  upstream.append("response_format", "json")

  const baseUrl = env.TRANSCRIBE_BASE_URL || "https://api.openai.com/v1"
  const response = await fetch(`${baseUrl}/audio/transcriptions`, {
    method: "POST",
    headers: { authorization: `Bearer ${env.TRANSCRIBE_API_KEY}` },
    body: upstream,
  })
  if (!response.ok) {
    console.error("transcrição falhou", response.status, await response.text())
    return json({ error: "upstream" }, 502)
  }
  const result = (await response.json()) as { text?: string }
  return json({ text: (result.text ?? "").trim() })
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === "/api/health") {
      return json({ transcribe: !!env.TRANSCRIBE_API_KEY })
    }
    if (url.pathname === "/api/transcribe" && request.method === "POST") {
      return transcribe(request, env)
    }
    if (url.pathname.startsWith("/api/")) return json({ error: "not-found" }, 404)

    return env.ASSETS.fetch(request)
  },
} satisfies ExportedHandler<Env>
