begin;

create function public.delete_media_asset(p_actor uuid, p_id uuid, p_revision integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  target public.media_assets%rowtype;
  blocker record;
begin
  perform 1 from public.owner_members
    where auth_user_id = p_actor and role = 'owner' and status = 'active' for share;
  if not found then raise exception 'Active owner required' using errcode = '42501'; end if;

  -- Serialize with media publication and hold catalog writes until reference checks and deletion finish.
  -- Feedback writes can take a key-share lock on a project, so lock Feedback first.
  perform pg_catalog.pg_advisory_xact_lock(20261113, 32);
  lock table public.portfolio_feedback, public.portfolio_projects, public.portfolio_project_media in exclusive mode;

  select * into target from public.media_assets where id = p_id for update;
  if not found then return jsonb_build_object('status', 'missing'); end if;
  if target.publication_revision is distinct from p_revision then return jsonb_build_object('status', 'stale'); end if;

  select kind, title into blocker from (
    select 1 as priority, m.id, 'poster' as kind, m.title from public.media_assets m
      where m.status = 'published' and m.poster_asset_id = p_id
    union all
    select 2, p.id, 'project', p.title from public.portfolio_projects p
      where p.status = 'published' and (p.cover_id = p_id or exists (
        select 1 from public.portfolio_project_media pm where pm.project_id = p.id and pm.asset_id = p_id
      ))
    union all
    select 3, f.id, 'feedback', f.client_name from public.portfolio_feedback f
      where f.status = 'published' and p_id in (f.avatar_id, f.proof_id, f.work_asset_id)
  ) references_to_asset order by priority, id limit 1;
  if found then return jsonb_build_object('status', blocker.kind, 'title', blocker.title); end if;
  if target.status = 'published' then return jsonb_build_object('status', 'published'); end if;

  update public.media_assets set poster_asset_id = null, publication_revision = publication_revision + 1
    where poster_asset_id = p_id;
  update public.portfolio_projects p set
    cover_id = case when p.cover_id = p_id then null else p.cover_id end,
    revision = p.revision + 1
    where p.cover_id = p_id or exists (
      select 1 from public.portfolio_project_media pm where pm.project_id = p.id and pm.asset_id = p_id
    );
  update public.portfolio_feedback f set
    avatar_id = case when f.avatar_id = p_id then null else f.avatar_id end,
    proof_id = case when f.proof_id = p_id then null else f.proof_id end,
    proof_approved = case when f.proof_id = p_id then false else f.proof_approved end,
    work_asset_id = case when f.work_asset_id = p_id then null else f.work_asset_id end,
    attachment_public = f.attachment_public - array_remove(array[
      case when f.avatar_id = p_id then 'avatar' end,
      case when f.proof_id = p_id then 'proof' end
    ], null),
    revision = f.revision + 1
    where p_id in (f.avatar_id, f.proof_id, f.work_asset_id);

  -- The foreign key cascades only the join rows for this asset.
  delete from public.media_assets where id = p_id;
  return jsonb_build_object('status', 'deleted', 'title', target.title);
end;
$$;

revoke all on function public.delete_media_asset(uuid, uuid, integer) from public, anon, authenticated, service_role;
grant execute on function public.delete_media_asset(uuid, uuid, integer) to service_role;

commit;
