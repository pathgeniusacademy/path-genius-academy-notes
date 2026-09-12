-- NOTES project only. Latest uploaded access-upgrade schema is the prerequisite.
-- No access mode, note ID, PDF, list member or grant is reset.
begin;
do $$
begin
 if to_regclass('public.note_folder_access') is null or to_regclass('public.note_folder_list_access') is null then
   raise exception 'First apply the latest uploaded APPLY-NOTES-ACCESS-UPGRADE.sql (not an older V3 file).';
 end if;
end $$;
update storage.buckets set public=false where id='class-notes';
revoke all on public.notes,public.student_note_access,public.note_folder_access,
 public.note_access_lists,public.note_access_list_members,public.note_folder_list_access,
 public.note_download_tickets,public.note_download_logs from anon,authenticated;
drop policy if exists pga_notes_originals_api_only on storage.objects;
create policy pga_notes_originals_api_only on storage.objects as restrictive
 for select to anon,authenticated using(bucket_id <> 'class-notes');
-- Statement-level invalidation also covers direct SQL/admin changes.
create or replace function public.pga_expire_note_tickets()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 update public.note_download_tickets set expires_at=now() where expires_at>now();
 return null;
end $$;
revoke all on function public.pga_expire_note_tickets() from public,anon,authenticated;
do $$
declare t text;
begin
 foreach t in array array['notes','student_note_access','note_folder_access','note_access_lists','note_access_list_members','note_folder_list_access'] loop
  execute format('drop trigger if exists pga_expire_note_tickets on public.%I',t);
  execute format('create trigger pga_expire_note_tickets after insert or update or delete on public.%I for each statement execute function public.pga_expire_note_tickets()',t);
 end loop;
end $$;
commit;
