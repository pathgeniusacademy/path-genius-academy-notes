-- Path Genius Notes - secure one-time download tickets
-- Run on the NEW path-genius-notes Supabase project.

create table if not exists public.note_download_tickets (
  id uuid primary key default gen_random_uuid(),
  student_id text not null,
  note_id uuid not null references public.notes(id) on delete cascade,
  student_name text not null,
  student_mobile text,
  login_id text not null,
  expires_at timestamptz not null default (now() + interval '2 minutes'),
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists note_download_tickets_note_idx
  on public.note_download_tickets(note_id);
create index if not exists note_download_tickets_expiry_idx
  on public.note_download_tickets(expires_at);

alter table public.note_download_tickets enable row level security;
