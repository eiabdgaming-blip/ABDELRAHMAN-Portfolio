begin;

create table public.portfolio_projects (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (char_length(slug) <= 80 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  description text not null check (char_length(description) <= 2000),
  category text check (category in ('beauty', 'fashion', 'product', 'travel')),
  project_format text not null check (project_format in ('reel', 'long-form')),
  status text not null default 'draft' check (status in ('draft', 'published', 'hidden')),
  display_order integer not null check (display_order between 0 and 99999),
  featured boolean not null default false,
  presentation text not null check (presentation in ('player', 'case-study')),
  cover_id uuid references public.media_assets(id) on delete set null,
  published_at timestamptz,
  revision integer not null default 0,
  check (status <> 'published' or published_at is not null)
);

create table public.portfolio_project_media (
  project_id uuid not null references public.portfolio_projects(id) on delete cascade,
  asset_id uuid not null references public.media_assets(id) on delete cascade,
  display_order integer not null check (display_order between 0 and 99999),
  primary key (project_id, asset_id)
);
create index portfolio_project_media_asset_idx on public.portfolio_project_media(asset_id);

create table public.portfolio_case_studies (
  project_id uuid primary key references public.portfolio_projects(id) on delete cascade,
  overview text not null check (char_length(overview) <= 4000),
  requirements text not null check (char_length(requirements) <= 4000),
  role text not null check (char_length(role) <= 4000),
  approach text not null check (char_length(approach) <= 4000),
  process text not null check (char_length(process) <= 4000),
  outcome text not null check (char_length(outcome) <= 4000)
);

create table public.portfolio_feedback (
  id uuid primary key default gen_random_uuid(),
  client_name text not null check (char_length(btrim(client_name)) between 1 and 120),
  affiliation text not null check (char_length(affiliation) <= 160),
  profile_url text check (char_length(profile_url) <= 240 and profile_url ~
    '^https://((www[.])?instagram[.]com/[A-Za-z0-9_.]+/?|(www[.])?tiktok[.]com/@[A-Za-z0-9_.]+/?|(www[.])?linkedin[.]com/in/[A-Za-z0-9-]+/?)$'),
  quote text not null check (char_length(btrim(quote)) between 1 and 3000),
  status text not null default 'draft' check (status in ('draft', 'published', 'hidden')),
  display_order integer not null check (display_order between 0 and 99999),
  featured boolean not null default false,
  avatar_id uuid references public.media_assets(id) on delete set null,
  proof_id uuid references public.media_assets(id) on delete set null,
  proof_approved boolean not null default false,
  project_id uuid references public.portfolio_projects(id) on delete set null,
  work_asset_id uuid references public.media_assets(id) on delete set null,
  published_at timestamptz,
  revision integer not null default 0,
  check (status <> 'published' or (published_at is not null and (proof_id is null or proof_approved))),
  check (project_id is null or work_asset_id is null)
);

create table public.portfolio_feedback_services (
  feedback_id uuid not null references public.portfolio_feedback(id) on delete cascade,
  service_id text not null references public.site_services(id) on delete cascade,
  primary key (feedback_id, service_id)
);

do $$
declare
  table_name text;
begin
  foreach table_name in array array['portfolio_projects', 'portfolio_project_media', 'portfolio_case_studies', 'portfolio_feedback', 'portfolio_feedback_services']
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from public, anon, authenticated, service_role', table_name);
    execute format('grant select on public.%I to authenticated', table_name);
    execute format('create policy "Active owner read" on public.%I for select to authenticated using
      (exists (select 1 from public.owner_members where auth_user_id = (select auth.uid()) and role = ''owner'' and status = ''active''))', table_name);
  end loop;
end;
$$;

-- These projections expose prepared CDN copies only. Hidden dependencies disappear at query time.
create view public.portfolio_public_assets with (security_barrier = true) as
select id, title, resource_type as kind, duration,
  (public_delivery->>'width')::integer as width, (public_delivery->>'height')::integer as height,
  public_delivery->>'url' as url, public_delivery->>'poster' as poster,
  public_delivery->>'poster_small' as small_poster
from public.media_assets where status = 'published' and public_delivery is not null;

create view public.portfolio_public_projects with (security_barrier = true) as
select p.id, p.slug, p.title, p.description, p.category, p.project_format, p.presentation,
  p.featured, p.display_order, p.published_at,
  coalesce(cover.poster, gallery.poster) as poster_url,
  coalesce(cover.small_poster, gallery.small_poster) as poster_small_url,
  gallery.media, gallery.lead
from public.portfolio_projects p
left join public.portfolio_public_assets cover on cover.id = p.cover_id
join lateral (
  select jsonb_agg(to_jsonb(a) order by pm.display_order, a.id) as media,
    (jsonb_agg(to_jsonb(a) order by pm.display_order, a.id) filter (where a.kind = 'video'))->0 as lead,
    (array_agg(a.poster order by pm.display_order, a.id))[1] as poster,
    (array_agg(a.small_poster order by pm.display_order, a.id))[1] as small_poster
  from public.portfolio_project_media pm join public.portfolio_public_assets a on a.id = pm.asset_id
  where pm.project_id = p.id
) gallery on gallery.media is not null
where p.status = 'published';

create view public.portfolio_public_case_studies with (security_barrier = true) as
select p.*, c.overview, c.requirements, c.role, c.approach, c.process, c.outcome
from public.portfolio_public_projects p join public.portfolio_case_studies c on c.project_id = p.id
where p.presentation = 'case-study';

create view public.portfolio_public_work with (security_barrier = true) as
select p.id, p.slug, p.title, p.description, p.category, p.project_format, p.presentation,
  p.display_order, p.published_at, p.poster_url, p.poster_small_url, p.media, p.lead
from public.portfolio_public_projects p
union all
select a.id, null::text, a.title, a.description, a.category, a.project_format, 'player',
  a.display_order, a.published_at, a.poster_url, a.poster_small_url, '[]'::jsonb,
  jsonb_build_object('id', a.id, 'title', a.title, 'kind', 'video', 'url', a.playback_url,
    'width', a.width, 'height', a.height, 'duration', a.duration)
from public.published_portfolio_media a
where a.placement in ('work', 'both') and not exists (
  select 1 from public.portfolio_project_media pm
  join public.portfolio_public_projects p on p.id = pm.project_id
  where pm.asset_id = a.id
);

create view public.portfolio_public_feedback with (security_barrier = true) as
select f.id, f.client_name, f.affiliation, f.profile_url, f.quote, f.featured, f.display_order, f.published_at,
  avatar.small_poster as avatar, proof.poster as proof,
  coalesce((
    select jsonb_agg(s.title order by s.display_order, s.id)
    from public.portfolio_feedback_services fs join public.site_services s on s.id = fs.service_id
    where fs.feedback_id = f.id and s.visible
  ), '[]'::jsonb) as services,
  coalesce(project.title, work.title) as work_title,
  case when project.presentation = 'case-study' then project.slug end as work_slug,
  coalesce(project.poster_url, work.poster_url) as work_poster,
  coalesce(project.lead, case when work.id is not null then jsonb_build_object('id', work.id, 'title', work.title,
    'kind', 'video', 'url', work.playback_url, 'width', work.width, 'height', work.height, 'duration', work.duration) end) as work_video
from public.portfolio_feedback f
left join public.portfolio_public_assets avatar on avatar.id = f.avatar_id and avatar.kind = 'image'
left join public.portfolio_public_assets proof on proof.id = f.proof_id and proof.kind = 'image' and f.proof_approved
left join public.portfolio_public_projects project on project.id = f.project_id
left join public.published_portfolio_media work on work.id = f.work_asset_id and work.placement in ('work', 'both')
where f.status = 'published';

revoke all on public.portfolio_public_assets, public.portfolio_public_projects, public.portfolio_public_case_studies,
  public.portfolio_public_work, public.portfolio_public_feedback from public, anon, authenticated, service_role;
grant select on public.portfolio_public_projects, public.portfolio_public_case_studies,
  public.portfolio_public_work, public.portfolio_public_feedback to anon, authenticated;

create function public.save_portfolio_entry(p_actor uuid, p_kind text, p_id uuid, p_revision integer, p_payload jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  entry_id uuid := coalesce(p_id, gen_random_uuid());
  next_status text := p_payload->>'status';
  item jsonb;
  study jsonb := p_payload->'study';
  has_study boolean := coalesce(jsonb_typeof(p_payload->'study') = 'object', false);
  cover uuid := (p_payload->>'cover_id')::uuid;
  avatar uuid := (p_payload->>'avatar_id')::uuid;
  proof uuid := (p_payload->>'proof_id')::uuid;
  linked_project uuid := (p_payload->>'project_id')::uuid;
  linked_work uuid := (p_payload->>'work_asset_id')::uuid;
begin
  perform 1 from public.owner_members
    where auth_user_id = p_actor and role = 'owner' and status = 'active' for share;
  if not found then raise exception 'Active owner required' using errcode = '42501'; end if;

  if p_kind = 'delete-feedback' then
    delete from public.portfolio_feedback where id = p_id and revision = p_revision;
    return case when found then p_id end;
  end if;

  if p_kind = 'project' then
    if p_id is not null then
      perform 1 from public.portfolio_projects where id = p_id and revision = p_revision for update;
      if not found then return null; end if;
    end if;
    if jsonb_typeof(p_payload->'media') is distinct from 'array' or jsonb_array_length(p_payload->'media') > 24 then
      raise exception 'Invalid project media' using errcode = '23514';
    end if;
    if next_status = 'published' then
      if jsonb_array_length(p_payload->'media') = 0 or exists (
        select 1 from jsonb_array_elements(p_payload->'media') x
        where not exists (select 1 from public.portfolio_public_assets a where a.id = (x->>'id')::uuid)
      ) or (cover is not null and not exists (select 1 from public.portfolio_public_assets where id = cover)) then
        raise exception 'Publish project media first' using errcode = '23514';
      end if;
      if p_payload->>'presentation' = 'case-study' and (not has_study or not exists (
        select 1 from jsonb_each_text(study) where length(btrim(value)) > 0
      )) then raise exception 'Case study text required' using errcode = '23514'; end if;
    end if;
    insert into public.portfolio_projects (id, slug, title, description, category, project_format, status, display_order,
      featured, presentation, cover_id, published_at)
    values (entry_id, p_payload->>'slug', p_payload->>'title', p_payload->>'description', p_payload->>'category',
      p_payload->>'project_format', next_status, (p_payload->>'display_order')::integer, (p_payload->>'featured')::boolean,
      p_payload->>'presentation', cover, case when next_status = 'published' then now() end)
    on conflict (id) do update set
      title = excluded.title, description = excluded.description, category = excluded.category,
      project_format = excluded.project_format, status = excluded.status, display_order = excluded.display_order,
      featured = excluded.featured, presentation = excluded.presentation, cover_id = excluded.cover_id,
      published_at = coalesce(portfolio_projects.published_at, excluded.published_at), revision = portfolio_projects.revision + 1;
    delete from public.portfolio_project_media where project_id = entry_id;
    for item in select value from jsonb_array_elements(p_payload->'media') loop
      insert into public.portfolio_project_media values (entry_id, (item->>'id')::uuid, (item->>'order')::integer);
    end loop;
    delete from public.portfolio_case_studies where project_id = entry_id;
    if has_study then
      insert into public.portfolio_case_studies values (entry_id, study->>'overview', study->>'requirements',
        study->>'role', study->>'approach', study->>'process', study->>'outcome');
    end if;
  elsif p_kind = 'feedback' then
    if p_id is not null then
      perform 1 from public.portfolio_feedback where id = p_id and revision = p_revision for update;
      if not found then return null; end if;
    end if;
    if exists (select 1 from public.media_assets where id in (avatar, proof) and resource_type <> 'image')
      or (next_status = 'published' and (
        (avatar is not null and not exists (select 1 from public.portfolio_public_assets where id = avatar)) or
        (proof is not null and not exists (select 1 from public.portfolio_public_assets where id = proof)) or
        (linked_project is not null and not exists (select 1 from public.portfolio_public_projects where id = linked_project)) or
        (linked_work is not null and not exists (select 1 from public.published_portfolio_media where id = linked_work and placement in ('work', 'both')))
      )) then raise exception 'Publish feedback dependencies first' using errcode = '23514'; end if;
    insert into public.portfolio_feedback (id, client_name, affiliation, profile_url, quote, status, display_order,
      featured, avatar_id, proof_id, proof_approved, project_id, work_asset_id, published_at)
    values (entry_id, p_payload->>'client_name', p_payload->>'affiliation', p_payload->>'profile_url',
      p_payload->>'quote', next_status, (p_payload->>'display_order')::integer, (p_payload->>'featured')::boolean,
      avatar, proof, (p_payload->>'proof_approved')::boolean, linked_project, linked_work,
      case when next_status = 'published' then now() end)
    on conflict (id) do update set
      client_name = excluded.client_name, affiliation = excluded.affiliation, profile_url = excluded.profile_url,
      quote = excluded.quote, status = excluded.status, display_order = excluded.display_order, featured = excluded.featured,
      avatar_id = excluded.avatar_id, proof_id = excluded.proof_id, proof_approved = excluded.proof_approved,
      project_id = excluded.project_id, work_asset_id = excluded.work_asset_id,
      published_at = coalesce(portfolio_feedback.published_at, excluded.published_at), revision = portfolio_feedback.revision + 1;
    delete from public.portfolio_feedback_services where feedback_id = entry_id;
    insert into public.portfolio_feedback_services
      select entry_id, value from jsonb_array_elements_text(p_payload->'services');
  else
    raise exception 'Invalid portfolio operation' using errcode = '22023';
  end if;
  return entry_id;
end;
$$;

revoke all on function public.save_portfolio_entry(uuid, text, uuid, integer, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.save_portfolio_entry(uuid, text, uuid, integer, jsonb) to service_role;

commit;
