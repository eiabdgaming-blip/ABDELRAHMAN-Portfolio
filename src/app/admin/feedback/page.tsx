import Link from 'next/link'
import { requireAdmin } from '../../../lib/admin-access'
import styles from '../admin.module.css'
import { FeedbackEditor, type FeedbackEntry } from '../portfolio-editor'

export default async function FeedbackPage() {
  const { supabase } = await requireAdmin()
  const [entries, media, projects, work, services, voice] = await Promise.all([
    supabase.from('portfolio_feedback').select('*,portfolio_feedback_services(service_id)').order('display_order').order('id'),
    supabase.from('media_assets').select('id,title,status,resource_type').eq('resource_type', 'image').order('title').order('id'),
    supabase.from('portfolio_public_projects').select('id,title').order('title').order('id'),
    supabase.from('published_portfolio_media').select('id,title').in('placement', ['work', 'both']).order('title').order('id'),
    supabase.from('site_services').select('id,title').order('display_order').order('id'),
    supabase.from('portfolio_voice_notes').select('id,title,duration').order('title').order('id'),
  ])
  const unavailable = entries.error || media.error || projects.error || work.error || services.error
  const options = { assets: media.data ?? [], projects: projects.data ?? [], work: work.data ?? [], services: services.data ?? [], recordings: voice.data ?? [] }
  return <div data-content-admin>
    <p><Link href="/admin">← Admin dashboard</Link></p>
    <h1>Client Feedback</h1>
    {unavailable ? <p role="alert">Feedback is unavailable. Check that the projects and feedback migration is applied.</p> : <>
      <p>{entries.data?.length} testimonials. Redact private details before approving a proof screenshot. Publishing feedback prepares public image copies for the selected photo and approved proof.</p>
      <details><summary>New testimonial</summary><FeedbackEditor {...options} /></details>
      <ul className={styles.contentList}>
        {((entries.data ?? []) as unknown as FeedbackEntry[]).map((entry) => <li key={entry.id}>
          <details><summary>{entry.client_name} <span>{entry.display_order} · {entry.status}</span></summary>
            <FeedbackEditor {...options} entry={entry} />
          </details>
        </li>)}
      </ul>
    </>}
  </div>
}
