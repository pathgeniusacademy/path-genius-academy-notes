-- Path Genius Academy Notes - Access Control Upgrade
-- SAFE / ADDITIVE migration. Run on the NOTES Supabase project.
-- Existing notes remain RESTRICTED by default.

begin;

alter table public.notes
  add column if not exists access_type text,
  add column if not exists description text,
  add column if not exists display_order integer not null default 0;

-- Security-first backward compatibility: all existing rows keep their current
-- restricted behavior unless an admin explicitly changes the access type.
update public.notes
set access_type = 'selected_users'
where access_type is null or btrim(access_type) = '';

alter table public.notes
  alter column access_type set default 'selected_users',
  alter column access_type set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'notes_access_type_check'
      and conrelid = 'public.notes'::regclass
  ) then
    alter table public.notes
      add constraint notes_access_type_check
      check (access_type in ('free', 'test_series', 'selected_users'));
  end if;
end $$;

create index if not exists notes_access_type_idx on public.notes(access_type);
create index if not exists notes_active_order_idx on public.notes(is_active, display_order, created_at desc);

-- Existing per-note selected-user table is reused. No duplicate user-access table is created.

-- The supplied admin UI already contains folder/list access controls. These
-- additive tables make those controls durable without changing existing note rows.
create table if not exists public.note_folder_access (
  id uuid primary key default gen_random_uuid(),
  student_id text not null,
  folder_id text not null,
  is_granted boolean not null default true,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique(student_id, folder_id)
);

create index if not exists note_folder_access_student_idx
  on public.note_folder_access(student_id, folder_id);

create table if not exists public.note_access_lists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.note_access_list_members (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.note_access_lists(id) on delete cascade,
  student_id text not null,
  created_at timestamptz not null default now(),
  unique(list_id, student_id)
);

create index if not exists note_access_list_members_student_idx
  on public.note_access_list_members(student_id, list_id);

create table if not exists public.note_folder_list_access (
  id uuid primary key default gen_random_uuid(),
  folder_id text not null,
  list_id uuid not null references public.note_access_lists(id) on delete cascade,
  is_granted boolean not null default true,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique(folder_id, list_id)
);

create index if not exists note_folder_list_access_folder_idx
  on public.note_folder_list_access(folder_id, list_id);

alter table public.note_folder_access enable row level security;
alter table public.note_access_lists enable row level security;
alter table public.note_access_list_members enable row level security;
alter table public.note_folder_list_access enable row level security;

-- Intentionally no browser policies. The notes Edge Function uses the service role.

commit;
