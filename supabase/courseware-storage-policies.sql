create policy "courseware_select_own"
on storage.objects
for select
using (
  bucket_id = 'courseware'
  and auth.uid()::text = split_part(name, '/', 1)
);

create policy "courseware_insert_own"
on storage.objects
for insert
with check (
  bucket_id = 'courseware'
  and auth.uid()::text = split_part(name, '/', 1)
);

create policy "courseware_update_own"
on storage.objects
for update
using (
  bucket_id = 'courseware'
  and auth.uid()::text = split_part(name, '/', 1)
)
with check (
  bucket_id = 'courseware'
  and auth.uid()::text = split_part(name, '/', 1)
);

create policy "courseware_delete_own"
on storage.objects
for delete
using (
  bucket_id = 'courseware'
  and auth.uid()::text = split_part(name, '/', 1)
);

