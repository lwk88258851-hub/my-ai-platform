create extension if not exists pgcrypto;

create table if not exists public.community_topics (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_by uuid not null,
  created_at timestamptz not null default now()
);

create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null,
  author_name text not null,
  title text not null,
  content text not null,
  topic_id uuid references public.community_topics(id) on delete set null,
  post_type text not null check (post_type in ('post','topic','work')),
  subject text,
  category text,
  cover_url text,
  created_at timestamptz not null default now()
);

do $$
declare
  r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'community_posts'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) like '%post_type%'
  loop
    execute format('alter table public.community_posts drop constraint if exists %I', r.conname);
  end loop;
end $$;

update public.community_posts
set post_type = 'post'
where post_type is null or post_type not in ('post','topic','work') or post_type = 'topic';

alter table public.community_posts
add constraint community_posts_post_type_check
check (post_type in ('post','topic','work'));

alter table public.community_posts add column if not exists subject text;
alter table public.community_posts add column if not exists category text;
alter table public.community_posts add column if not exists cover_url text;

create table if not exists public.community_post_assets (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  url text not null,
  mime_type text not null,
  file_name text,
  created_at timestamptz not null default now()
);

alter table public.community_post_assets add column if not exists file_name text;

create table if not exists public.community_post_likes (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  unique (post_id, user_id)
);

create table if not exists public.community_post_favorites (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  unique (post_id, user_id)
);

create table if not exists public.community_post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  author_id uuid not null,
  author_name text not null,
  content text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.community_comment_assets (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.community_post_comments(id) on delete cascade,
  url text not null,
  mime_type text not null,
  file_name text,
  created_at timestamptz not null default now()
);

alter table public.community_comment_assets add column if not exists file_name text;
create index if not exists community_comment_assets_comment_id_idx on public.community_comment_assets (comment_id);

create table if not exists public.community_post_events (
  id bigserial primary key,
  post_id uuid not null references public.community_posts(id) on delete cascade,
  event_type text not null check (event_type in ('view','share')),
  user_id uuid not null,
  created_at timestamptz not null default now()
);

create index if not exists community_posts_created_at_idx on public.community_posts (created_at desc);
create index if not exists community_posts_topic_id_idx on public.community_posts (topic_id);
create index if not exists community_post_assets_post_id_idx on public.community_post_assets (post_id);
create index if not exists community_post_likes_post_id_idx on public.community_post_likes (post_id);
create index if not exists community_post_favorites_post_id_idx on public.community_post_favorites (post_id);
create index if not exists community_post_comments_post_id_idx on public.community_post_comments (post_id);
create index if not exists community_post_events_post_id_idx on public.community_post_events (post_id);
create index if not exists community_post_events_created_at_idx on public.community_post_events (created_at desc);

alter table public.community_topics enable row level security;
alter table public.community_posts enable row level security;
alter table public.community_post_assets enable row level security;
alter table public.community_post_likes enable row level security;
alter table public.community_post_favorites enable row level security;
alter table public.community_post_comments enable row level security;
alter table public.community_post_events enable row level security;
alter table public.community_comment_assets enable row level security;

drop policy if exists community_topics_select on public.community_topics;
create policy community_topics_select on public.community_topics for select to authenticated using (true);

drop policy if exists community_topics_insert on public.community_topics;
create policy community_topics_insert on public.community_topics for insert to authenticated with check (auth.uid() = created_by);

drop policy if exists community_posts_select on public.community_posts;
create policy community_posts_select on public.community_posts for select to authenticated using (true);

drop policy if exists community_posts_insert on public.community_posts;
create policy community_posts_insert on public.community_posts for insert to authenticated with check (auth.uid() = author_id);

drop policy if exists community_posts_update on public.community_posts;
create policy community_posts_update on public.community_posts for update to authenticated using (auth.uid() = author_id) with check (auth.uid() = author_id);

drop policy if exists community_posts_delete on public.community_posts;
create policy community_posts_delete on public.community_posts for delete to authenticated using (auth.uid() = author_id);

drop policy if exists community_assets_select on public.community_post_assets;
create policy community_assets_select on public.community_post_assets for select to authenticated using (true);

drop policy if exists community_assets_insert on public.community_post_assets;
create policy community_assets_insert on public.community_post_assets for insert to authenticated with check (
  exists (select 1 from public.community_posts p where p.id = post_id and p.author_id = auth.uid())
);

drop policy if exists community_assets_delete on public.community_post_assets;
create policy community_assets_delete on public.community_post_assets for delete to authenticated using (
  exists (select 1 from public.community_posts p where p.id = post_id and p.author_id = auth.uid())
);

drop policy if exists community_likes_select on public.community_post_likes;
create policy community_likes_select on public.community_post_likes for select to authenticated using (true);

drop policy if exists community_likes_insert on public.community_post_likes;
create policy community_likes_insert on public.community_post_likes for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists community_likes_delete on public.community_post_likes;
create policy community_likes_delete on public.community_post_likes for delete to authenticated using (auth.uid() = user_id);

drop policy if exists community_favorites_select on public.community_post_favorites;
create policy community_favorites_select on public.community_post_favorites for select to authenticated using (true);

drop policy if exists community_favorites_insert on public.community_post_favorites;
create policy community_favorites_insert on public.community_post_favorites for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists community_favorites_delete on public.community_post_favorites;
create policy community_favorites_delete on public.community_post_favorites for delete to authenticated using (auth.uid() = user_id);

drop policy if exists community_comments_select on public.community_post_comments;
create policy community_comments_select on public.community_post_comments for select to authenticated using (true);

drop policy if exists community_comments_insert on public.community_post_comments;
create policy community_comments_insert on public.community_post_comments for insert to authenticated with check (auth.uid() = author_id);

drop policy if exists community_comments_delete on public.community_post_comments;
create policy community_comments_delete on public.community_post_comments for delete to authenticated using (auth.uid() = author_id);

drop policy if exists community_events_select on public.community_post_events;
create policy community_events_select on public.community_post_events for select to authenticated using (true);

drop policy if exists community_events_insert on public.community_post_events;
create policy community_events_insert on public.community_post_events for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists community_comment_assets_select on public.community_comment_assets;
create policy community_comment_assets_select on public.community_comment_assets for select to authenticated using (true);

drop policy if exists community_comment_assets_insert on public.community_comment_assets;
create policy community_comment_assets_insert on public.community_comment_assets for insert to authenticated with check (
  exists (
    select 1
    from public.community_post_comments c
    join public.community_posts p on p.id = c.post_id
    where c.id = comment_id
      and c.author_id = auth.uid()
      and p.post_type in ('post','topic')
  )
);

drop policy if exists community_comment_assets_delete on public.community_comment_assets;
create policy community_comment_assets_delete on public.community_comment_assets for delete to authenticated using (
  exists (
    select 1
    from public.community_post_comments c
    join public.community_posts p on p.id = c.post_id
    where c.id = comment_id
      and c.author_id = auth.uid()
      and p.post_type in ('post','topic')
  )
);

create or replace view public.community_post_stats as
select
  p.id as post_id,
  (select count(*) from public.community_post_likes l where l.post_id = p.id) as likes_count,
  (select count(*) from public.community_post_comments c where c.post_id = p.id) as comments_count,
  (select count(*) from public.community_post_favorites f where f.post_id = p.id) as favorites_count,
  (select count(*) from public.community_post_events e where e.post_id = p.id and e.event_type = 'share') as shares_count,
  (select count(*) from public.community_post_events e where e.post_id = p.id and e.event_type = 'view') as views_count,
  (
    (select count(*) from public.community_post_likes l where l.post_id = p.id) * 3 +
    (select count(*) from public.community_post_comments c where c.post_id = p.id) * 5 +
    (select count(*) from public.community_post_favorites f where f.post_id = p.id) * 4 +
    (select count(*) from public.community_post_events e where e.post_id = p.id and e.event_type = 'share') * 6 +
    (select count(*) from public.community_post_events e where e.post_id = p.id and e.event_type = 'view') * 1
  )::numeric as heat
from public.community_posts p;

create or replace view public.community_post_feed_view as
select
  p.id,
  p.title,
  p.content,
  p.topic_id,
  t.name as topic_name,
  p.post_type,
  p.author_id,
  p.author_name,
  p.created_at,
  coalesce(s.likes_count, 0) as likes_count,
  coalesce(s.comments_count, 0) as comments_count,
  coalesce(s.favorites_count, 0) as favorites_count,
  coalesce(s.shares_count, 0) as shares_count,
  coalesce(s.views_count, 0) as views_count,
  coalesce(s.heat, 0) as heat,
  coalesce(
    jsonb_agg(jsonb_build_object('url', a.url, 'mime_type', a.mime_type, 'file_name', a.file_name) order by a.created_at) filter (where a.id is not null),
    '[]'::jsonb
  ) as assets,
  p.subject,
  p.category,
  p.cover_url
from public.community_posts p
left join public.community_topics t on t.id = p.topic_id
left join public.community_post_stats s on s.post_id = p.id
left join public.community_post_assets a on a.post_id = p.id
group by p.id, t.name, s.likes_count, s.comments_count, s.favorites_count, s.shares_count, s.views_count, s.heat;

create or replace view public.community_post_rank_view as
select * from public.community_post_feed_view;

create or replace view public.community_favorites_view as
select
  f.user_id,
  f.created_at as favorited_at,
  v.*
from public.community_post_favorites f
join public.community_post_feed_view v on v.id = f.post_id;

create or replace view public.community_user_likes_view as
select
  l.user_id,
  l.created_at as liked_at,
  v.*
from public.community_post_likes l
join public.community_post_feed_view v on v.id = l.post_id;

create or replace view public.community_user_comments_view as
select
  c.author_id as user_id,
  c.id as comment_id,
  c.created_at as commented_at,
  c.content as comment_content,
  v.*
from public.community_post_comments c
join public.community_post_feed_view v on v.id = c.post_id;

create or replace view public.community_user_shares_view as
select
  e.user_id,
  e.created_at as shared_at,
  v.*
from public.community_post_events e
join public.community_post_feed_view v on v.id = e.post_id
where e.event_type = 'share';

create or replace view public.community_comment_feed_view as
select
  c.id,
  c.post_id,
  c.author_id,
  c.author_name,
  c.content,
  c.created_at,
  coalesce(
    jsonb_agg(jsonb_build_object('url', a.url, 'mime_type', a.mime_type, 'file_name', a.file_name) order by a.created_at) filter (where a.id is not null),
    '[]'::jsonb
  ) as assets
from public.community_post_comments c
left join public.community_comment_assets a on a.comment_id = c.id
group by c.id;

create table if not exists public.user_profiles (
  user_id uuid primary key,
  display_name text,
  avatar_url text,
  school text,
  class_name text,
  updated_at timestamptz not null default now()
);

alter table public.user_profiles enable row level security;

drop policy if exists user_profiles_select on public.user_profiles;
create policy user_profiles_select on public.user_profiles for select to authenticated using (true);

drop policy if exists user_profiles_insert on public.user_profiles;
create policy user_profiles_insert on public.user_profiles for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists user_profiles_update on public.user_profiles;
create policy user_profiles_update on public.user_profiles for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

do $$
begin
  begin
    insert into storage.buckets (id, name, public)
    values ('community-works', 'community-works', true)
    on conflict (id) do nothing;
  exception when insufficient_privilege then
    raise notice 'Skipped storage bucket create: community-works (insufficient privilege)';
  end;

  begin
    insert into storage.buckets (id, name, public)
    values ('profile-avatars', 'profile-avatars', true)
    on conflict (id) do nothing;
  exception when insufficient_privilege then
    raise notice 'Skipped storage bucket create: profile-avatars (insufficient privilege)';
  end;

  begin
    alter table storage.objects enable row level security;
  exception when insufficient_privilege then
    raise notice 'Skipped enable RLS on storage.objects (insufficient privilege)';
  end;

  begin
    execute 'drop policy if exists community_works_read on storage.objects';
    execute 'create policy community_works_read on storage.objects for select to authenticated using (bucket_id = ''community-works'')';
    execute 'drop policy if exists community_works_read_anon on storage.objects';
    execute 'create policy community_works_read_anon on storage.objects for select to anon using (bucket_id = ''community-works'')';
  exception when insufficient_privilege then
    raise notice 'Skipped storage.objects policies for community-works read (insufficient privilege)';
  end;

  begin
    execute 'drop policy if exists community_works_insert on storage.objects';
    execute 'create policy community_works_insert on storage.objects for insert to authenticated with check (bucket_id = ''community-works'')';
  exception when insufficient_privilege then
    raise notice 'Skipped storage.objects policies for community-works insert (insufficient privilege)';
  end;

  begin
    execute 'drop policy if exists profile_avatars_read on storage.objects';
    execute 'create policy profile_avatars_read on storage.objects for select to authenticated using (bucket_id = ''profile-avatars'')';
    execute 'drop policy if exists profile_avatars_read_anon on storage.objects';
    execute 'create policy profile_avatars_read_anon on storage.objects for select to anon using (bucket_id = ''profile-avatars'')';
  exception when insufficient_privilege then
    raise notice 'Skipped storage.objects policies for profile-avatars read (insufficient privilege)';
  end;

  begin
    execute 'drop policy if exists profile_avatars_insert on storage.objects';
    execute 'create policy profile_avatars_insert on storage.objects for insert to authenticated with check (bucket_id = ''profile-avatars'' and (storage.foldername(name))[2] = auth.uid()::text)';
  exception when insufficient_privilege then
    raise notice 'Skipped storage.objects policies for profile-avatars insert (insufficient privilege)';
  end;
end $$;
