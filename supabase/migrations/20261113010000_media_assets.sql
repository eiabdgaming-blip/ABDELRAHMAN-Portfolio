begin;

create table public.media_assets (
  id uuid primary key,
  owner_id uuid not null references auth.users (id),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  cloudinary_asset_id text not null unique check (cloudinary_asset_id ~ '^[0-9a-fA-F]{32}$'),
  cloudinary_public_id text not null unique check (cloudinary_public_id = 'abdel-media-' || id::text),
  resource_type text not null check (resource_type in ('image', 'video')),
  delivery_type text not null check (delivery_type = 'authenticated'),
  secure_url text not null check (secure_url like 'https://res.cloudinary.com/%'),
  format text not null,
  bytes bigint not null check (bytes > 0),
  width integer not null check (width between 1 and 100000),
  height integer not null check (height between 1 and 100000),
  duration double precision,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  status text not null default 'draft' check (status = 'draft'),
  created_at timestamptz not null default now(),
  check (
    (resource_type = 'image' and format in ('jpg', 'png', 'webp') and bytes <= 10000000
      and width::bigint * height <= 25000000 and duration is null)
    or
    (resource_type = 'video' and format in ('mp4', 'webm') and bytes <= 100000000
      and duration is not null and duration > 0 and duration < 'Infinity'::double precision)
  )
);

create index media_assets_created_id_idx on public.media_assets (created_at desc, id desc);

alter table public.media_assets enable row level security;
revoke all on table public.media_assets from public, anon, authenticated, service_role;
grant select on table public.media_assets to authenticated;
grant select, insert on table public.media_assets to service_role;

create policy "Active owners can read media drafts"
  on public.media_assets for select to authenticated
  using (exists (
    select 1 from public.owner_members
    where auth_user_id = (select auth.uid()) and role = 'owner' and status = 'active'
  ));

-- The server credential bypasses RLS, so check active ownership at insert time too.
create function public.require_active_media_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1 from public.owner_members
  where auth_user_id = new.owner_id and role = 'owner' and status = 'active'
  for share;
  if not found then
    raise exception 'Active owner required for media writes' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.require_active_media_owner() from public, anon, authenticated;
create trigger media_assets_require_owner
  before insert on public.media_assets
  for each row execute function public.require_active_media_owner();

commit;
