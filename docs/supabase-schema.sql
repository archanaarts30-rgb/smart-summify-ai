-- ═══════════════════════════════════════════════════════
--  Smart Summify AI — Supabase Database Schema
--  Run this entire file in: Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ─── Users ────────────────────────────────────────────────────────
create table if not exists public.users (
  id                    uuid primary key default uuid_generate_v4(),
  firebase_uid          text unique not null,
  email                 text not null,
  display_name          text,
  plan                  text not null default 'free' check (plan in ('free', 'basic', 'premium')),
  stripe_customer_id    text unique,
  stripe_subscription_id text,
  subscription_status   text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- ─── Summaries ────────────────────────────────────────────────────
create table if not exists public.summaries (
  id                    uuid primary key default uuid_generate_v4(),
  user_id               uuid not null references public.users(id) on delete cascade,
  source_url            text,
  file_name             text,
  summary_text          text not null,
  size_requested        text not null check (size_requested in ('small', 'medium', 'large')),
  -- Token metrics
  input_tokens          int not null default 0,
  output_tokens         int not null default 0,
  -- Word metrics
  original_word_count   int not null default 0,
  summary_word_count    int not null default 0,
  -- Time metrics
  original_read_sec     int not null default 0,
  summary_read_sec      int not null default 0,
  time_saved_sec        int not null default 0,
  duration_ms           int not null default 0,
  created_at            timestamptz not null default now()
);

-- ─── Chat messages ────────────────────────────────────────────────
create table if not exists public.chat_messages (
  id          uuid primary key default uuid_generate_v4(),
  summary_id  uuid not null references public.summaries(id) on delete cascade,
  user_id     uuid not null references public.users(id) on delete cascade,
  role        text not null check (role in ('user', 'assistant')),
  content     text not null,
  created_at  timestamptz not null default now()
);

-- ─── Indexes for performance ──────────────────────────────────────
create index if not exists idx_summaries_user_id    on public.summaries(user_id);
create index if not exists idx_summaries_created_at on public.summaries(created_at desc);
create index if not exists idx_chat_messages_summary on public.chat_messages(summary_id);
create index if not exists idx_users_firebase_uid   on public.users(firebase_uid);
create index if not exists idx_users_stripe         on public.users(stripe_customer_id);

-- ─── Updated_at auto-trigger ─────────────────────────────────────
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger users_updated_at
  before update on public.users
  for each row execute function public.handle_updated_at();

-- ─── Row Level Security ───────────────────────────────────────────
-- Note: We use the service role key in the backend, which bypasses RLS.
-- RLS is a safety net for direct client access (if you ever add it).

alter table public.users enable row level security;
alter table public.summaries enable row level security;
alter table public.chat_messages enable row level security;

-- Service role bypasses all RLS — backend uses this key.
-- Direct client access would need explicit policies.
