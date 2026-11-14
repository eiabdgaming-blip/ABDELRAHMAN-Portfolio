begin;

create table public.contact_leads (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  email text check (char_length(email) <= 254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'),
  whatsapp text check (whatsapp ~ '^[+][1-9][0-9]{7,14}$'),
  project_type text not null check (project_type in ('Reels & Shorts', 'Long-form', 'Other')),
  service text check (char_length(btrim(service)) between 1 and 120),
  brief text not null check (char_length(btrim(brief)) between 1 and 3000),
  budget text check (char_length(budget) <= 100),
  deadline text check (char_length(deadline) <= 100),
  status text not null default 'new' check (status in ('new','contacted','in-progress','completed','archived')),
  owner_notes text not null default '' check (char_length(owner_notes) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (email is not null or whatsapp is not null)
);
create index contact_leads_recent on public.contact_leads(created_at desc, id desc);
create index contact_leads_status_recent on public.contact_leads(status, created_at desc, id desc);

-- Only short-lived keyed hashes are retained for throttling and safe retries.
create table public.contact_submission_window (
  submission_id uuid primary key,
  fingerprint text not null check (fingerprint ~ '^[0-9a-f]{64}$'),
  email_key text check (email_key ~ '^[0-9a-f]{64}$'),
  phone_key text check (phone_key ~ '^[0-9a-f]{64}$'),
  received_at timestamptz not null default now()
);
create index contact_submission_window_recent on public.contact_submission_window(received_at);

alter table public.contact_leads enable row level security;
alter table public.contact_submission_window enable row level security;
revoke all on public.contact_leads, public.contact_submission_window from public, anon, authenticated, service_role;
grant select on public.contact_leads to authenticated;
grant update (status, owner_notes) on public.contact_leads to authenticated;
create policy "Active owners read leads" on public.contact_leads for select to authenticated using (
  exists (select 1 from public.owner_members where auth_user_id = (select auth.uid()) and role = 'owner' and status = 'active')
);
create policy "Active owners update leads" on public.contact_leads for update to authenticated using (
  exists (select 1 from public.owner_members where auth_user_id = (select auth.uid()) and role = 'owner' and status = 'active')
);

create function public.touch_contact_lead() returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := greatest(clock_timestamp(), old.updated_at + interval '1 microsecond');
  return new;
end;
$$;
revoke all on function public.touch_contact_lead() from public, anon, authenticated, service_role;
create trigger contact_leads_updated before update on public.contact_leads
  for each row execute function public.touch_contact_lead();

create function public.submit_contact_lead(p_token uuid, p_fingerprint text, p_email_key text, p_phone_key text, p_lead jsonb)
returns text language plpgsql security definer set search_path = '' as $$
declare
  previous text;
  moment timestamptz;
begin
  -- Serialize the small public intake across server instances, including retries.
  perform pg_catalog.pg_advisory_xact_lock(20261113, 34);
  moment := clock_timestamp();
  delete from public.contact_submission_window where received_at < moment - interval '24 hours';
  select fingerprint into previous from public.contact_submission_window where submission_id = p_token;
  if found then
    if previous = p_fingerprint then return 'saved'; end if;
    return 'conflict';
  end if;
  if exists (select 1 from public.contact_submission_window
    where fingerprint = p_fingerprint and received_at >= moment - interval '10 minutes') then
    return 'saved';
  end if;
  if (select count(*) from public.contact_submission_window where received_at >= moment - interval '1 hour') >= 40 or
    (p_email_key is not null and (select count(*) from public.contact_submission_window
      where email_key = p_email_key and received_at >= moment - interval '1 hour') >= 3) or
    (p_phone_key is not null and (select count(*) from public.contact_submission_window
      where phone_key = p_phone_key and received_at >= moment - interval '1 hour') >= 3) then
    return 'limited';
  end if;

  insert into public.contact_leads (name, email, whatsapp, project_type, service, brief, budget, deadline)
  values (p_lead->>'name', p_lead->>'email', p_lead->>'whatsapp', p_lead->>'project_type',
    p_lead->>'service', p_lead->>'brief', p_lead->>'budget', p_lead->>'deadline');
  insert into public.contact_submission_window values (p_token, p_fingerprint, p_email_key, p_phone_key, moment);
  return 'saved';
end;
$$;
revoke all on function public.submit_contact_lead(uuid,text,text,text,jsonb) from public, anon, authenticated, service_role;
grant execute on function public.submit_contact_lead(uuid,text,text,text,jsonb) to service_role;

commit;
