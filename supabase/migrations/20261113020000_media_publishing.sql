begin;

alter table public.media_assets
  drop constraint media_assets_status_check,
  add constraint media_assets_status_check check (status in ('draft', 'published', 'hidden')),
  add column placement text not null default 'work' check (placement in ('home', 'work', 'both')),
  add column project_format text not null default 'reel' check (project_format in ('reel', 'long-form')),
  add column featured boolean not null default false,
  add column display_order integer not null default 0 check (display_order between 0 and 99999),
  add column category text check (category in ('beauty', 'fashion', 'product', 'travel')),
  add column description text check (char_length(description) <= 1000),
  add column poster_asset_id uuid references public.media_assets(id) on delete set null,
  add column public_delivery jsonb,
  add column preparation_started_at timestamptz,
  add column published_at timestamptz,
  add column publication_revision integer not null default 0,
  add constraint media_assets_publication_settings check (
    (placement = 'work' or (resource_type = 'video' and project_format = 'reel')) and
    (not featured or placement in ('home', 'both')) and
    (status <> 'published' or placement <> 'home' or featured) and
    (poster_asset_id is null or (resource_type = 'video' and poster_asset_id <> id))
  ),
  add constraint media_assets_publication_ready check (
    status <> 'published' or (published_at is not null and public_delivery is not null and coalesce(
      jsonb_typeof(public_delivery) = 'object' and
      public_delivery->>'asset_id' ~ '^[0-9a-fA-F]{32}$' and
      public_delivery->>'public_id' ~ '^abdel-web-v1-[0-9a-f]{32}$' and
      public_delivery->>'url' ~ '^https://res[.]cloudinary[.]com/[^/]+/(image|video)/upload/' and
      public_delivery->>'poster' ~ '^https://res[.]cloudinary[.]com/[^/]+/(image|video)/upload/' and
      public_delivery->>'poster_small' ~ '^https://res[.]cloudinary[.]com/[^/]+/(image|video)/upload/' and
      public_delivery->>'format' = case when resource_type = 'video' then 'mp4' else 'webp' end and
      jsonb_typeof(public_delivery->'width') = 'number' and jsonb_typeof(public_delivery->'height') = 'number' and
      (public_delivery->>'width')::integer > 0 and (public_delivery->>'height')::integer > 0,
      false
    ))
  );

create index media_assets_published_order_idx
  on public.media_assets (display_order, published_at desc, id)
  where status = 'published' and resource_type = 'video';

-- This view is owned by the migration role and intentionally exposes only public fields.
create view public.published_portfolio_media with (security_barrier = true) as
select m.id, m.title, m.description, m.placement, m.project_format, m.featured, m.display_order,
  m.category, m.published_at, m.duration,
  (m.public_delivery->>'width')::integer as width, (m.public_delivery->>'height')::integer as height,
  m.public_delivery->>'url' as playback_url,
  coalesce(p.public_delivery->>'poster', m.public_delivery->>'poster') as poster_url,
  coalesce(p.public_delivery->>'poster_small', m.public_delivery->>'poster_small') as poster_small_url
from public.media_assets m
left join public.media_assets p on p.id = m.poster_asset_id and p.status = 'published' and p.resource_type = 'image'
where m.status = 'published' and m.resource_type = 'video';

revoke all on public.published_portfolio_media from public, anon, authenticated, service_role;
grant select on public.published_portfolio_media to anon, authenticated;

-- Only the server credential can call this function. The actor is checked again under lock.
create function public.change_media_publication(
  p_actor uuid, p_id uuid, p_revision integer, p_command text,
  p_settings jsonb default null, p_delivery jsonb default null
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  target public.media_assets%rowtype;
  next_featured boolean;
  next_status text;
begin
  perform 1 from public.owner_members
    where auth_user_id = p_actor and role = 'owner' and status = 'active' for share;
  if not found then raise exception 'Active owner required' using errcode = '42501'; end if;

  -- Serialize settings changes so simultaneous publications cannot exceed the Home limit.
  perform pg_catalog.pg_advisory_xact_lock(20261113, 32);
  select * into target from public.media_assets where id = p_id for update;
  if not found or target.publication_revision is distinct from p_revision then return 'stale'; end if;

  if p_command = 'hide' then
    if target.status <> 'published' then return 'stale'; end if;
    update public.media_assets set status = 'hidden', publication_revision = publication_revision + 1 where id = p_id;
    return 'saved';
  end if;

  if p_command is null or p_command not in ('save', 'publish', 'queue') or p_settings is null then return 'invalid'; end if;
  if (p_command in ('publish', 'queue') and target.status = 'published')
     or (p_command = 'publish' and p_delivery is null) then return 'stale'; end if;
  next_status := case when p_command in ('publish', 'queue') then 'published' else target.status end;
  next_featured := (p_settings->>'featured')::boolean;

  if next_status = 'published' and next_featured and (
    select count(*) from public.media_assets where id <> p_id and status = 'published' and featured
  ) >= 6 then return 'featured_limit'; end if;

  if p_settings->>'poster_asset_id' is not null and not exists (
    select 1 from public.media_assets
      where id = (p_settings->>'poster_asset_id')::uuid and resource_type = 'image'
        and (status = 'published' or id = target.poster_asset_id)
  ) then return 'invalid_poster'; end if;

  if p_command = 'queue' then
    if target.preparation_started_at > now() - interval '5 minutes' then return 'pending'; end if;
    update public.media_assets set preparation_started_at = now() where id = p_id;
    return 'queued';
  end if;

  update public.media_assets set
    title = p_settings->>'title', placement = p_settings->>'placement',
    project_format = p_settings->>'project_format', featured = next_featured,
    display_order = (p_settings->>'display_order')::integer,
    category = p_settings->>'category', description = p_settings->>'description',
    poster_asset_id = (p_settings->>'poster_asset_id')::uuid,
    status = next_status, publication_revision = publication_revision + 1,
    public_delivery = case when p_command = 'publish' then p_delivery else public_delivery end,
    published_at = case when p_command = 'publish' then now() else published_at end
  where id = p_id;
  return 'saved';
end;
$$;

revoke all on function public.change_media_publication(uuid, uuid, integer, text, jsonb, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.change_media_publication(uuid, uuid, integer, text, jsonb, jsonb) to service_role;

commit;
