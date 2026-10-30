# Tarefas

To-do list web (PWA) com criação de tarefas por voz ou texto em português.

## Rodar

```bash
npm install
npm run dev
```

## Stack

Vite + React + TypeScript, Tailwind v4 + shadcn/ui, Dexie (IndexedDB, local-first),
Zustand, react-hook-form + zod, date-fns, vite-plugin-pwa.

## Estrutura

- `src/features/tasks/` — modelo, banco (Dexie), repositório, agrupamento e UI da lista/formulário
- `src/features/voice/` — barra inferior, reconhecimento de voz (Web Speech API) e parser pt-BR
  - `parse-task.ts` transforma frases como "pagar a luz amanhã às 10, prioridade alta,
    descrição vence dia 5" em título, data, hora, prioridade e descrição
  - `use-speech-recognition.ts` é o adaptador de voz; no app nativo pode ser trocado
    por um plugin mantendo a mesma interface

## Barra inferior

- **+** abre o formulário completo
- **Segure para falar** grava enquanto pressionado; arraste para fora para cancelar
- **Teclado/microfone** alterna entre voz e texto
- **Onda sonora** toca para falar (para sozinho no silêncio)

Voz abre o formulário pré-preenchido para confirmar; texto cria a tarefa direto
(com "Editar" no aviso). Atalhos no desktop: `/` digita, `n` abre o formulário.

O reconhecimento de voz depende do navegador: funciona no Chrome, Edge e Safari;
o Firefox não suporta.
