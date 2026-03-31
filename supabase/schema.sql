create table if not exists public.conversations (
  user_id text primary key,
  summary text not null default '',
  messages jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.conversations
  add column if not exists session_version bigint not null default 0;

alter table public.conversations enable row level security;

create index if not exists conversations_updated_at_idx
  on public.conversations (updated_at desc);
