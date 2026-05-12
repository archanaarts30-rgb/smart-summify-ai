-- Run once in Supabase SQL Editor if `feedback` does not exist yet.
-- (Also merged into docs/supabase-schema.sql for greenfield setups.)

create table if not exists public.feedback (
  id                  uuid primary key default uuid_generate_v4(),
  user_id             uuid not null references public.users(id) on delete cascade,
  category            text not null default 'general'
                      check (category in ('bug', 'feature', 'billing', 'general')),
  message             text not null,
  extension_version   text,
  created_at          timestamptz not null default now()
);

create index if not exists idx_feedback_created_at on public.feedback (created_at desc);
create index if not exists idx_feedback_user_id    on public.feedback (user_id);

alter table public.feedback enable row level security;

grant usage on schema public to anon, authenticated, service_role;
grant all on table public.feedback to service_role;
grant all on table public.feedback to authenticated;
