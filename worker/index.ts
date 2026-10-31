/**
 * Worker do Cloudflare: serve o app (assets estáticos) e a API em /api/*.
 *
 * /api/transcribe recebe o áudio gravado no navegador e transcreve com o
 * Whisper do Cloudflare Workers AI (sem chave). Se TRANSCRIBE_API_KEY estiver
 * definida, usa um serviço compatível com a API da OpenAI (OpenAI, Groq…).
 */

interface Env {
  ASSETS: Fetcher
  AI?: Ai
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

function toBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ""
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}

async function transcribeWithWorkersAi(ai: Ai, audio: File) {
  const result = (await ai.run("@cf/openai/whisper-large-v3-turbo", {
    audio: toBase64(await audio.arrayBuffer()),
    language: "pt",
    initial_prompt: PROMPT,
    vad_filter: true,
  })) as { text?: string }
  return (result.text ?? "").trim()
}

async function transcribeWithOpenAiCompatible(env: Env, audio: File) {
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
    throw new Error(`transcrição falhou: ${response.status} ${await response.text()}`)
  }
  const result = (await response.json()) as { text?: string }
  return (result.text ?? "").trim()
}

const canTranscribe = (env: Env) => !!env.TRANSCRIBE_API_KEY || !!env.AI

async function transcribe(request: Request, env: Env) {
  if (!canTranscribe(env)) return json({ error: "not-configured" }, 503)
  if (!(await isAuthorized(request, env))) return json({ error: "unauthorized" }, 401)

  const form = await request.formData()
  const audio = form.get("audio")
  if (!(audio instanceof File) || audio.size === 0) return json({ error: "no-audio" }, 400)
  if (audio.size > MAX_AUDIO_BYTES) return json({ error: "too-large" }, 413)

  try {
    const text = env.TRANSCRIBE_API_KEY
      ? await transcribeWithOpenAiCompatible(env, audio)
      : await transcribeWithWorkersAi(env.AI!, audio)
    return json({ text })
  } catch (error) {
    console.error("transcrição falhou", audio.type, audio.size, error)
    return json({ error: "upstream" }, 502)
  }
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === "/api/health") {
      return json({ transcribe: canTranscribe(env) })
    }
    if (url.pathname === "/api/transcribe" && request.method === "POST") {
      return transcribe(request, env)
    }
    if (url.pathname.startsWith("/api/")) return json({ error: "not-found" }, 404)

    return env.ASSETS.fetch(request)
  },
} satisfies ExportedHandler<Env>
