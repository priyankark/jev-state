-- Apply once to a dedicated Supabase project. All writes go through the server.
create table public.studio_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  customer_id text unique,
  subscription_id text unique,
  subscription_status text not null default 'none',
  paid_until timestamptz,
  cancel_at_period_end boolean not null default false,
  billing_updated_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.studio_workspaces (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revision integer not null default 0,
  data jsonb not null default '{"projects":[],"conversations":[],"reports":[]}',
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(data->'projects') = 'array')
);
create table public.studio_credentials (
  user_id uuid references auth.users(id) on delete cascade,
  provider text check (provider in ('jev','openai')),
  encrypted_key text not null,
  updated_at timestamptz not null default now(),
  primary key(user_id, provider)
);
create table public.studio_webhook_events (
  event_id text primary key,
  received_at timestamptz not null default now()
);
create table public.studio_rate_limits (
  user_id uuid references auth.users(id) on delete cascade,
  action text not null,
  bucket timestamptz not null,
  count integer not null default 1,
  primary key(user_id, action)
);

alter table public.studio_accounts enable row level security;
alter table public.studio_workspaces enable row level security;
alter table public.studio_credentials enable row level security;
alter table public.studio_webhook_events enable row level security;
alter table public.studio_rate_limits enable row level security;
revoke all on public.studio_accounts, public.studio_workspaces, public.studio_credentials,
  public.studio_webhook_events, public.studio_rate_limits from anon, authenticated;
grant all on public.studio_accounts, public.studio_workspaces, public.studio_credentials,
  public.studio_webhook_events, public.studio_rate_limits to service_role;

-- Row locks make quota checks and optimistic concurrency atomic across servers.
create function public.studio_save_workspace(p_user uuid, p_revision integer, p_data jsonb)
returns integer language plpgsql set search_path = '' as $$
declare w public.studio_workspaces; a public.studio_accounts; lim integer; next_revision integer;
begin
  insert into public.studio_accounts(user_id) values(p_user) on conflict do nothing;
  insert into public.studio_workspaces(user_id) values(p_user) on conflict do nothing;
  select * into a from public.studio_accounts where user_id = p_user for update;
  select * into w from public.studio_workspaces where user_id = p_user for update;
  if w.revision <> p_revision then raise exception 'WORKSPACE_CONFLICT'; end if;
  lim := case when a.subscription_status = 'active' and a.paid_until > now() then 100 else 3 end;
  if jsonb_array_length(p_data->'projects') > lim and exists (
    select 1 from jsonb_array_elements(p_data->'projects') n
    where not exists (select 1 from jsonb_array_elements(w.data->'projects') old where old->>'id' = n->>'id')
  ) then raise exception 'PROJECT_LIMIT'; end if;
  update public.studio_workspaces set data = p_data, revision = revision + 1, updated_at = now()
    where user_id = p_user returning revision into next_revision;
  return next_revision;
end $$;

create function public.studio_rate_limit(p_user uuid, p_action text, p_limit integer)
returns boolean language plpgsql set search_path = '' as $$
declare n integer;
begin
  insert into public.studio_rate_limits(user_id, action, bucket) values(p_user, p_action, date_trunc('minute', now()))
  on conflict(user_id, action) do update set
    count = case when studio_rate_limits.bucket = excluded.bucket then studio_rate_limits.count + 1 else 1 end,
    bucket = excluded.bucket returning count into n;
  return n <= p_limit;
end $$;

-- Verified webhooks only. Duplicate and older events cannot regress entitlements.
create function public.studio_apply_subscription(
  p_event text, p_at timestamptz, p_customer text, p_subscription text,
  p_status text, p_until timestamptz, p_cancel boolean
) returns boolean language plpgsql set search_path = '' as $$
begin
  insert into public.studio_webhook_events(event_id) values(p_event) on conflict do nothing;
  if not found then return false; end if;
  update public.studio_accounts set subscription_id=p_subscription, subscription_status=p_status,
    paid_until=p_until, cancel_at_period_end=p_cancel, billing_updated_at=p_at
  where customer_id=p_customer and (billing_updated_at is null or billing_updated_at <= p_at)
    and (subscription_id is null or subscription_id=p_subscription or subscription_status <> 'active' or paid_until <= now());
  return found;
end $$;
revoke all on function public.studio_save_workspace(uuid,integer,jsonb),
  public.studio_rate_limit(uuid,text,integer),
  public.studio_apply_subscription(text,timestamptz,text,text,text,timestamptz,boolean) from public,anon,authenticated;
grant execute on function public.studio_save_workspace(uuid,integer,jsonb),
  public.studio_rate_limit(uuid,text,integer),
  public.studio_apply_subscription(text,timestamptz,text,text,text,timestamptz,boolean) to service_role;
