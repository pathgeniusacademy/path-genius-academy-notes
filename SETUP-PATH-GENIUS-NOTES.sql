
-- Path Genius Notes: Core database setup
-- Run this only on the NEW notes Supabase project.

create extension if not exists pgcrypto;

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  main_class_id text not null,
  main_folder_id text,
  subject_name text,
  class_title text not null,
  note_title text not null default 'Class Notes',
  storage_path text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists notes_main_class_id_idx
  on public.notes(main_class_id);

create index if not exists notes_main_folder_id_idx
  on public.notes(main_folder_id);

create table if not exists public.student_note_access (
  id uuid primary key default gen_random_uuid(),
  student_id text not null,
  note_id uuid not null references public.notes(id) on delete cascade,
  is_granted boolean not null default true,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique(student_id, note_id)
);

create index if not exists student_note_access_student_idx
  on public.student_note_access(student_id);

create index if not exists student_note_access_note_idx
  on public.student_note_access(note_id);

create table if not exists public.note_download_logs (
  id uuid primary key default gen_random_uuid(),
  student_id text not null,
  note_id uuid not null references public.notes(id) on delete cascade,
  student_name text,
  student_mobile text,
  downloaded_at timestamptz not null default now()
);

create index if not exists note_download_logs_student_idx
  on public.note_download_logs(student_id);

create index if not exists note_download_logs_note_idx
  on public.note_download_logs(note_id);

alter table public.notes enable row level security;
alter table public.student_note_access enable row level security;
alter table public.note_download_logs enable row level security;

-- Intentionally no public/authenticated policies.
-- Secure Edge Functions will use the service-role key server-side.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists notes_set_updated_at on public.notes;
create trigger notes_set_updated_at
before update on public.notes
for each row execute function public.set_updated_at();
