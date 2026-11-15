begin;

-- Keep the existing publication contract and grants. Home no longer limits featured reels.
create or replace function public.change_media_publication(
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

  -- Serialize with media deletion and other publication changes.
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

commit;
