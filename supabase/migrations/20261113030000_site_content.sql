begin;

create table public.site_services (
  id text primary key default gen_random_uuid()::text
    check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(id) <= 80),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  description text not null check (char_length(btrim(description)) between 1 and 1000),
  display_order integer not null check (display_order between 0 and 99999),
  visible boolean not null default false
);

create table public.site_faq (
  id uuid primary key default gen_random_uuid(),
  question text not null check (char_length(btrim(question)) between 1 and 200),
  answer text not null check (char_length(btrim(answer)) between 1 and 2000),
  display_order integer not null check (display_order between 0 and 99999),
  published boolean not null default false
);

create table public.site_contact (
  id boolean primary key default true check (id),
  email text not null check (
    char_length(email) <= 254 and length(split_part(email, '@', 1)) <= 64 and
    email ~ '^[A-Za-z0-9_+-]+([.][A-Za-z0-9_+-]+)*@[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?([.][A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*[.][A-Za-z]{2,63}$'
  ),
  whatsapp text not null check (whatsapp ~ '^https://wa[.]me/[1-9][0-9]{7,14}$'),
  instagram text not null check (instagram ~ '^https://(www[.])?instagram[.]com/[A-Za-z0-9_][A-Za-z0-9_.]{0,29}/?$'),
  tiktok text not null check (tiktok ~ '^https://(www[.])?tiktok[.]com/@[A-Za-z0-9_][A-Za-z0-9_.]{0,23}/?$')
);

alter table public.site_services enable row level security;
alter table public.site_faq enable row level security;
alter table public.site_contact enable row level security;

revoke all on public.site_services, public.site_faq, public.site_contact from public, anon, authenticated, service_role;
grant select on public.site_services, public.site_faq, public.site_contact to anon, authenticated;
grant insert (title, description, display_order, visible), update (title, description, display_order, visible)
  on public.site_services to authenticated;
grant insert (question, answer, display_order, published), update (question, answer, display_order, published)
  on public.site_faq to authenticated;
grant delete on public.site_faq to authenticated;
grant update (email, whatsapp, instagram, tiktok) on public.site_contact to authenticated;

create policy "Read visible services" on public.site_services for select to anon, authenticated using (visible);
create policy "Read published FAQ" on public.site_faq for select to anon, authenticated using (published);
create policy "Read public contact settings" on public.site_contact for select to anon, authenticated using (true);

-- The existing owner_members policy reveals only the caller's active membership.
create policy "Owner reads services" on public.site_services for select to authenticated using (
  exists (select 1 from public.owner_members where auth_user_id = (select auth.uid()) and role = 'owner' and status = 'active')
);
create policy "Owner adds services" on public.site_services for insert to authenticated with check (
  exists (select 1 from public.owner_members where auth_user_id = (select auth.uid()) and role = 'owner' and status = 'active')
);
create policy "Owner updates services" on public.site_services for update to authenticated using (
  exists (select 1 from public.owner_members where auth_user_id = (select auth.uid()) and role = 'owner' and status = 'active')
);
create policy "Owner reads FAQ" on public.site_faq for select to authenticated using (
  exists (select 1 from public.owner_members where auth_user_id = (select auth.uid()) and role = 'owner' and status = 'active')
);
create policy "Owner adds FAQ" on public.site_faq for insert to authenticated with check (
  exists (select 1 from public.owner_members where auth_user_id = (select auth.uid()) and role = 'owner' and status = 'active')
);
create policy "Owner updates FAQ" on public.site_faq for update to authenticated using (
  exists (select 1 from public.owner_members where auth_user_id = (select auth.uid()) and role = 'owner' and status = 'active')
);
create policy "Owner deletes FAQ" on public.site_faq for delete to authenticated using (
  exists (select 1 from public.owner_members where auth_user_id = (select auth.uid()) and role = 'owner' and status = 'active')
);
create policy "Owner updates contact settings" on public.site_contact for update to authenticated using (
  exists (select 1 from public.owner_members where auth_user_id = (select auth.uid()) and role = 'owner' and status = 'active')
);

insert into public.site_services (id, title, description, display_order, visible) values
  ('video-editing', 'Video Editing', 'Cinematic edits that carry rhythm, emotion, and story — from short reels to long-form content built to hook and hold attention.', 10, true),
  ('filmmaking', 'Filmmaking', 'End-to-end film production: concept, direction, and shooting. Crafting visuals that feel intentional, cinematic, and unforgettable.', 20, true),
  ('color-grading', 'Color Grading', 'Precise color work that gives every frame a signature look — mood, contrast, and tone tuned to match the story you''re telling.', 30, true),
  ('motion-vfx', 'Motion & VFX', 'Motion graphics, transitions, and subtle VFX that elevate cuts and push edits into a more dynamic, modern visual language.', 40, true),
  ('content-strategy', 'Content Strategy', 'Concepting and packaging content for brands and creators — hooks, pacing, and framing tuned for real reach on Instagram and TikTok.', 50, true);

-- The first question is currently public. The other approved questions are available for the owner to publish.
insert into public.site_faq (question, answer, display_order, published) values
  ('What timelines do you work to?', 'Timing is confirmed after we review the footage and scope.', 10, true),
  ('What types of projects do you take on?', 'The portfolio covers Reels & Shorts and long-form projects. See Services for editing, filming, color, motion and content strategy.', 20, false),
  ('How do revisions work?', 'Include any review rounds and deadlines you need in the brief so they can be discussed with the scope.', 30, false),
  ('Do you work in Arabic and English?', 'Include the languages needed for your footage, captions and deliverables in the project brief.', 40, false),
  ('What software do you use?', 'The edit study references Premiere Pro and After Effects. Include any project-file or workflow requirements in your brief.', 50, false),
  ('How do you quote a project?', 'Share the footage, scope, deliverables and deadline so the project can be scoped before quoting.', 60, false),
  ('How does collaboration start?', 'Start with a project brief and at least one reply channel. Include your goals, footage and deliverables.', 70, false);

insert into public.site_contact (email, whatsapp, instagram, tiktok) values (
  'eiabdgaming@gmail.com', 'https://wa.me/201007372106',
  'https://www.instagram.com/abdo_ve1/', 'https://www.tiktok.com/@abdo_ve_1'
);

commit;
