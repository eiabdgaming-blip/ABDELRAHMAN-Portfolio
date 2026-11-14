import type { Metadata } from 'next'
import Link from 'next/link'
import { requireAdmin } from '../../lib/admin-access'
import { signOut } from './actions'
import { leadStatuses } from '../../domain/leads'
import styles from './admin.module.css'

export const metadata: Metadata = { title: 'Admin' }

export default async function AdminPage() {
  const { user, supabase } = await requireAdmin()
  const count = () => supabase.from('media_assets').select('id', { count: 'exact', head: true })
  const countLeads = () => supabase.from('contact_leads').select('id', { count: 'exact', head: true })
  const [total, published, draft, hidden, featured, recent, allLeads, newLeads, inProgress, completed, recentLeads] = await Promise.all([
    count(),
    count().eq('status', 'published'),
    count().eq('status', 'draft'),
    count().eq('status', 'hidden'),
    count().eq('status', 'published').eq('featured', true).eq('resource_type', 'video')
      .eq('project_format', 'reel').in('placement', ['home', 'both']),
    supabase.from('media_assets').select('id,title,status,created_at')
      .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(5),
    countLeads(), countLeads().eq('status', 'new'), countLeads().eq('status', 'in-progress'), countLeads().eq('status', 'completed'),
    supabase.from('contact_leads').select('id,name,status,created_at')
      .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(5),
  ])
  const statistics = [
    ['Total media assets', total.count], ['Published', published.count], ['Draft', draft.count],
    ['Hidden', hidden.count], ['Featured Home Reels', featured.count],
  ] as const
  const leadStatistics = [
    ['Total leads', allLeads.count], ['New inquiries', newLeads.count],
    ['In-progress inquiries', inProgress.count], ['Completed inquiries', completed.count],
  ] as const
  return (
    <div data-content-admin>
      <h1>Admin dashboard</h1>
      <p>Signed in as {user.email ?? 'owner'}.</p>
      <nav aria-label="Admin sections" className={styles.controls}>
        <Link className="glass" href="/admin/media">Media Library</Link>
        <Link className="glass" href="/admin/projects">Projects</Link>
        <Link className="glass" href="/admin/feedback">Client Feedback</Link>
        <Link className="glass" href="/admin/content/services">Services</Link>
        <Link className="glass" href="/admin/content/faq">FAQ</Link>
        <Link className="glass" href="/admin/content/settings">Site Settings</Link>
        <Link className="glass" href="/admin/leads">Leads</Link>
      </nav>
      <h2>Media overview</h2>
      <dl className={styles.statistics}>
        {statistics.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value ?? 'Unavailable'}</dd></div>)}
      </dl>
      <h2>Recent media</h2>
      {recent.error ? <p role="status">Recent media is unavailable.</p> : recent.data.length ? (
        <ul className={styles.contentList}>
          {recent.data.map(({ id, title, status, created_at }) => <li key={id}>
            {title} <span className={styles.mediaStatus}>{status}</span> <time dateTime={created_at}>{created_at.slice(0, 10)}</time>
          </li>)}
        </ul>
      ) : <p>No media assets yet.</p>}
      <h2>Lead overview</h2>
      <dl className={styles.statistics}>
        {leadStatistics.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value ?? 'Unavailable'}</dd></div>)}
      </dl>
      <h2>Recent inquiries</h2>
      {recentLeads.error ? <p role="status">Recent inquiries are unavailable.</p> : recentLeads.data.length ?
        <ul className={styles.contentList}>{recentLeads.data.map(({ id, name, status, created_at }) => <li key={id}>
          <Link href={`/admin/leads?lead=${id}#lead-${id}`}>{name}</Link>{' '}
          <span className={styles.mediaStatus}>{leadStatuses[status as keyof typeof leadStatuses]}</span>{' '}
          <time dateTime={created_at}>{created_at.slice(0, 10)}</time>
        </li>)}</ul> : <p>No inquiries yet.</p>}
      <form action={signOut}><button className="glass" type="submit">Sign out</button></form>
    </div>
  )
}
