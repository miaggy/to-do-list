-- Rode este arquivo no Supabase: SQL Editor → New query → colar → Run.

create table if not exists public.tasks (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null,
  description text not null default '',
  due_date date,
  due_time text,
  priority text not null default 'none'
    check (priority in ('none', 'low', 'medium', 'high', 'urgent')),
  completed boolean not null default false,
  completed_at timestamptz,
  source text not null default 'manual',
  created_at timestamptz not null,
  -- Hora da última edição no aparelho (decide quem vence num conflito)
  updated_at timestamptz not null,
  -- Exclusão "suave" para que a remoção chegue aos outros aparelhos
  deleted_at timestamptz,
  -- Hora em que o servidor recebeu a mudança (cursor da sincronização)
  server_updated_at timestamptz not null default now()
);

create index if not exists tasks_user_server_updated_idx
  on public.tasks (user_id, server_updated_at);

-- Acesso pela API só para usuários logados (não depende de "expose new tables")
revoke all on public.tasks from anon;
grant select, insert, update, delete on public.tasks to authenticated;

-- Cada usuário só enxerga e altera as próprias tarefas
alter table public.tasks enable row level security;

drop policy if exists "tarefas do próprio usuário" on public.tasks;
create policy "tarefas do próprio usuário" on public.tasks
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Marca a hora do servidor e ignora edições mais antigas que a versão salva
create or replace function public.tasks_before_write()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    return null;
  end if;
  new.server_updated_at := now();
  return new;
end;
$$;

drop trigger if exists tasks_before_write on public.tasks;
create trigger tasks_before_write
  before insert or update on public.tasks
  for each row execute function public.tasks_before_write();

-- Avisa os aparelhos conectados em tempo real
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tasks'
  ) then
    alter publication supabase_realtime add table public.tasks;
  end if;
end;
$$;
