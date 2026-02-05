create table if not exists public.ai_connectors (
  id uuid primary key,
  name text not null,
  kind text not null check (kind in ('openai_compat', 'zhipu', 'http')),
  base_url text,
  model_default text,
  headers_json jsonb,
  encrypted_api_key text,
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.ai_connectors enable row level security;

create table if not exists public.ai_feature_routes (
  feature_id text primary key,
  connector_id uuid not null references public.ai_connectors(id),
  output_format text not null,
  system_prompt text,
  model_override text,
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.ai_feature_routes enable row level security;

