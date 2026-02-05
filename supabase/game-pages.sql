do $$
begin
  begin
    insert into storage.buckets (id, name, public)
    values ('game-pages', 'game-pages', true)
    on conflict (id) do nothing;
  exception when others then
    raise notice 'Skipped storage bucket create: game-pages (insufficient privilege)';
  end;

  begin
    execute 'create policy game_pages_read on storage.objects for select to authenticated using (bucket_id = ''game-pages'')';
    execute 'create policy game_pages_read_anon on storage.objects for select to anon using (bucket_id = ''game-pages'')';
  exception when others then
    raise notice 'Skipped storage.objects policies for game-pages read (insufficient privilege)';
  end;

  begin
    execute 'create policy game_pages_insert on storage.objects for insert to authenticated with check (bucket_id = ''game-pages'')';
  exception when others then
    raise notice 'Skipped storage.objects policies for game-pages insert (insufficient privilege)';
  end;

end $$;
