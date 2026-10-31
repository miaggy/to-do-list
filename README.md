# Tarefas

To-do list web (PWA) com criação de tarefas por voz em português, sincronizada na nuvem.

## Rodar localmente

```bash
npm install
npm run dev          # app em http://localhost:5173
npm run dev:worker   # API (/api/*) em http://localhost:8787 — opcional
npm test
```

Para a API local, copie `.dev.vars.example` para `.dev.vars`. Para sincronizar em dev,
crie `.env.local` com `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.

## Arquitetura

- **App**: Vite + React + TypeScript, Tailwind v4 + shadcn/ui, PWA
- **Dados**: local-first no IndexedDB (Dexie), sincronizados com o **Supabase**
  (Postgres + tempo real). Funciona offline; as mudanças vão
  para uma fila e sobem quando a conexão volta. Em conflito vence a edição mais recente.
- **Hospedagem**: **Cloudflare Workers** serve o app e a API (`worker/index.ts`)
- **Voz**: dois motores, escolhidos automaticamente
  - *navegador*: Web Speech API, com texto ao vivo (Chrome/Edge no desktop e Android)
  - *servidor*: grava o áudio e transcreve em `/api/transcribe` (iPhone, Firefox),
    com o Whisper do Cloudflare Workers AI (sem chave). Opcionalmente, um serviço
    compatível com a API da OpenAI (secret `TRANSCRIBE_API_KEY`).
  - `?voz=servidor` ou `?voz=navegador` força um motor; `?debug=voz` mostra os eventos

```
src/features/tasks/   modelo, Dexie, repositório, lista e formulário
src/features/sync/    motor de sincronização com o Supabase (+ testes)
src/features/auth/    chave de sincronização (conta única do Supabase)
src/features/voice/   barra inferior, motores de voz e parser pt-BR (parse-task.ts)
worker/               Worker do Cloudflare (assets + /api)
supabase/schema.sql   tabela, regras de acesso (RLS), trigger e tempo real
```

## Configuração (uma vez)

### 1. Supabase
1. Crie um projeto em https://supabase.com (região São Paulo).
2. **SQL Editor** → cole e rode `supabase/schema.sql`.
3. **Authentication → Users → Add user → Create new user**: e-mail `tarefas@example.com`
   (ou outro, definido em `VITE_SYNC_EMAIL`), uma senha forte e **Auto Confirm User**
   marcado. Essa senha é a **chave de sincronização**: digite-a uma vez em cada aparelho
   (botão *Sincronizar* no topo); depois a sincronização é automática. Nenhum e-mail é enviado.
4. Copie a *Project URL* e a *anon/publishable key* (Project Settings → API) para
   `.env` e para `vars` em `wrangler.jsonc`. Elas são públicas; a proteção
   dos dados é feita pelas regras de acesso do banco e pela chave.

### 2. Transcrição de voz
Usa o Whisper do **Cloudflare Workers AI** (binding `AI` em `wrangler.jsonc`), sem
chave. Para usar OpenAI ou Groq no lugar, cadastre o secret `TRANSCRIBE_API_KEY` no
Worker e ajuste `TRANSCRIBE_BASE_URL`/`TRANSCRIBE_MODEL`. Só usuários logados
conseguem usar a transcrição.

### 3. Cloudflare
**Workers & Pages → Create → Import a repository** → este repositório:
- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`
- Non-production branch deploy command: `npx wrangler versions upload` (gera URL de preview por branch)
