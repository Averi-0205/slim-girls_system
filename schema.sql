-- 轻盈 · Supabase 数据库结构
-- 在 Supabase Dashboard 的 SQL Editor 中完整执行一次。

create table if not exists public.slim_girls_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.slim_girls_state enable row level security;

drop policy if exists "Users can read own app state" on public.slim_girls_state;
create policy "Users can read own app state"
on public.slim_girls_state
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own app state" on public.slim_girls_state;
create policy "Users can insert own app state"
on public.slim_girls_state
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update own app state" on public.slim_girls_state;
create policy "Users can update own app state"
on public.slim_girls_state
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete own app state" on public.slim_girls_state;
create policy "Users can delete own app state"
on public.slim_girls_state
for delete
to authenticated
using ((select auth.uid()) = user_id);

grant select, insert, update, delete
on table public.slim_girls_state
to authenticated;

comment on table public.slim_girls_state is
'Per-user application state for the Slim Girls weight management site.';
