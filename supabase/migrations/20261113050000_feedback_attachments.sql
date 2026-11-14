begin;

create table public.portfolio_voice_notes (
  id uuid primary key,
  owner_id uuid not null references auth.users(id),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  asset_id text not null unique check (asset_id ~ '^[a-fA-F0-9]{32}$'),
  format text not null check (format in ('mp3', 'wav')),
  bytes integer not null check (bytes between 1 and 10000000),
  duration double precision not null check (duration > 0 and duration <= 300),
  version bigint not null check (version > 0)
);
alter table public.portfolio_voice_notes enable row level security;
revoke all on public.portfolio_voice_notes from public, anon, authenticated, service_role;
grant select on public.portfolio_voice_notes to authenticated;
grant insert, select on public.portfolio_voice_notes to service_role;
create policy "Owner reads voice notes" on public.portfolio_voice_notes for select to authenticated using (
  exists (select 1 from public.owner_members where auth_user_id = (select auth.uid()) and role = 'owner' and status = 'active')
);
create trigger portfolio_voice_notes_require_owner before insert on public.portfolio_voice_notes
  for each row execute function public.require_active_media_owner();

alter table public.portfolio_feedback
  add column instagram_url text check (char_length(instagram_url) <= 240 and instagram_url ~ '^https://(www[.])?instagram[.]com/[A-Za-z0-9_.]+/?$'),
  add column tiktok_url text check (char_length(tiktok_url) <= 240 and tiktok_url ~ '^https://(www[.])?tiktok[.]com/@[A-Za-z0-9_.]+/?$'),
  add column linkedin_url text check (char_length(linkedin_url) <= 240 and linkedin_url ~ '^https://(www[.])?linkedin[.]com/in/[A-Za-z0-9-]+/?$'),
  add column voice_id uuid references public.portfolio_voice_notes(id),
  add column voice_approved boolean not null default false,
  add column attachment_public jsonb not null default '{}'::jsonb check (jsonb_typeof(attachment_public) = 'object'),
  add constraint portfolio_feedback_voice_approval check (status <> 'published' or voice_id is null or voice_approved);

update public.portfolio_feedback set
  instagram_url = case when profile_url ~ '^https://(www[.])?instagram[.]com/' then profile_url end,
  tiktok_url = case when profile_url ~ '^https://(www[.])?tiktok[.]com/' then profile_url end,
  linkedin_url = case when profile_url ~ '^https://(www[.])?linkedin[.]com/' then profile_url end;

create or replace view public.portfolio_public_feedback with (security_barrier = true) as
select f.id, f.client_name, f.affiliation, f.profile_url, f.quote, f.featured, f.display_order, f.published_at,
  coalesce(case when avatar_source.status <> 'hidden' then f.attachment_public->>'avatar' end, avatar.small_poster) as avatar,
  case when f.proof_approved then coalesce(
    case when proof_source.status <> 'hidden' then f.attachment_public->>'proof' end, proof.poster
  ) end as proof,
  coalesce((
    select jsonb_agg(s.title order by s.display_order, s.id)
    from public.portfolio_feedback_services fs join public.site_services s on s.id = fs.service_id
    where fs.feedback_id = f.id and s.visible
  ), '[]'::jsonb) as services,
  coalesce(project.title, work.title) as work_title,
  case when project.presentation = 'case-study' then project.slug end as work_slug,
  coalesce(project.poster_url, work.poster_url) as work_poster,
  coalesce(project.lead, case when work.id is not null then jsonb_build_object('id', work.id, 'title', work.title,
    'kind', 'video', 'url', work.playback_url, 'width', work.width, 'height', work.height, 'duration', work.duration) end) as work_video,
  f.instagram_url, f.tiktok_url, f.linkedin_url, voice.duration as voice_duration
from public.portfolio_feedback f
left join public.media_assets avatar_source on avatar_source.id = f.avatar_id
left join public.media_assets proof_source on proof_source.id = f.proof_id
left join public.portfolio_public_assets avatar on avatar.id = f.avatar_id and avatar.kind = 'image'
left join public.portfolio_public_assets proof on proof.id = f.proof_id and proof.kind = 'image' and f.proof_approved
left join public.portfolio_public_projects project on project.id = f.project_id
left join public.published_portfolio_media work on work.id = f.work_asset_id and work.placement in ('work', 'both')
left join public.portfolio_voice_notes voice on voice.id = f.voice_id and f.voice_approved
where f.status = 'published';

grant select (id, voice_id, voice_approved, status, avatar_id, proof_id, attachment_public) on public.portfolio_feedback to service_role;

-- Delegate existing validation, locking, and relationship writes to Phase 03.3B.
create function public.save_feedback_attachments(p_actor uuid, p_id uuid, p_revision integer, p_payload jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  entry_id uuid;
  voice uuid := (p_payload->>'voice_id')::uuid;
  approved boolean := coalesce((p_payload->>'voice_approved')::boolean, false);
  attachments jsonb := coalesce(p_payload->'attachment_public', '{}'::jsonb);
  avatar uuid := (p_payload->>'avatar_id')::uuid;
  proof uuid := (p_payload->>'proof_id')::uuid;
  slot text;
  source_id uuid;
  copy_url text;
begin
  -- Updating a previously published row and replacing its voice must be atomic.
  perform 1 from public.owner_members where auth_user_id = p_actor and role = 'owner' and status = 'active' for share;
  if not found then raise exception 'Active owner required' using errcode = '42501'; end if;
  foreach slot in array array['avatar', 'proof'] loop
    source_id := case when slot = 'avatar' then avatar else proof end;
    copy_url := attachments->>slot;
    if copy_url is not null and (
      source_id is null or (slot = 'proof' and not coalesce((p_payload->>'proof_approved')::boolean, false)) or
      not exists (select 1 from public.media_assets where id = source_id and resource_type = 'image') or
      copy_url !~ '^https://res[.]cloudinary[.]com/[a-zA-Z0-9_-]+/image/upload/v[0-9]+/abdel-feedback-[a-f0-9]{32}[.]webp$'
    ) then raise exception 'Invalid feedback image' using errcode = '23514'; end if;
  end loop;
  if p_id is not null then
    perform 1 from public.portfolio_feedback where id = p_id and revision = p_revision for update;
    if not found then return null; end if;
    update public.portfolio_feedback set voice_id = null, voice_approved = false where id = p_id;
  end if;
  entry_id := public.save_portfolio_entry(p_actor, 'feedback', p_id, p_revision, p_payload ||
    case when attachments ? 'avatar' then '{"avatar_id":null}'::jsonb else '{}'::jsonb end ||
    case when attachments ? 'proof' then '{"proof_id":null}'::jsonb else '{}'::jsonb end);
  update public.portfolio_feedback set instagram_url = p_payload->>'instagram_url',
    tiktok_url = p_payload->>'tiktok_url', linkedin_url = p_payload->>'linkedin_url',
    voice_id = voice, voice_approved = approved, avatar_id = avatar, proof_id = proof, attachment_public = attachments
  where id = entry_id;
  return entry_id;
end;
$$;
revoke all on function public.save_feedback_attachments(uuid, uuid, integer, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.save_feedback_attachments(uuid, uuid, integer, jsonb) to service_role;

commit;
