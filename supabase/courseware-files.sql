create table if not exists public.courseware_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  object_path text not null,
  original_name text not null,
  mime_type text,
  created_at timestamptz not null default now(),
  unique (user_id, object_path)
);

alter table public.courseware_files enable row level security;

create policy "courseware_files_select_own"
on public.courseware_files
for select
using (auth.uid() = user_id);

create policy "courseware_files_insert_own"
on public.courseware_files
for insert
with check (auth.uid() = user_id);

create policy "courseware_files_update_own"
on public.courseware_files
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "courseware_files_delete_own"
on public.courseware_files
for delete
using (auth.uid() = user_id);

