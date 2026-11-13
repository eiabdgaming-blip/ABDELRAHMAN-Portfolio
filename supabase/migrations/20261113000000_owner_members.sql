begin;

create table public.owner_members (
  auth_user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'owner' check (role = 'owner'),
  status text not null default 'active' check (status in ('active', 'disabled'))
);

alter table public.owner_members enable row level security;

revoke all on table public.owner_members from public, anon, authenticated;
grant select on table public.owner_members to authenticated;

create policy "Active owners can read their own membership"
  on public.owner_members
  for select
  to authenticated
  using ((select auth.uid()) = auth_user_id and role = 'owner' and status = 'active');

commit;
