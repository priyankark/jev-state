alter table public.studio_accounts add column checkout_id text;
alter table public.studio_accounts add column checkout_url text;
alter table public.studio_accounts add column checkout_at timestamptz;
alter table public.studio_accounts add column checkout_lock_until timestamptz;

create function public.studio_claim_checkout(p_user uuid) returns boolean
language plpgsql set search_path = '' as $$
begin
  update public.studio_accounts set checkout_lock_until = now() + interval '60 seconds'
  where user_id=p_user and (checkout_lock_until is null or checkout_lock_until < now());
  return found;
end $$;
revoke all on function public.studio_claim_checkout(uuid) from public,anon,authenticated;
grant execute on function public.studio_claim_checkout(uuid) to service_role;
