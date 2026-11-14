import Link from 'next/link'
import { requireAdmin } from '../../../lib/admin-access'
import { leadStatuses, leadTokenPattern, phonePattern } from '../../../domain/leads'
import { contactValue } from '../../../domain/site-content'
import styles from '../admin.module.css'
import { LeadForm } from './form'

const perPage = 20
type Search = { status?: string; q?: string; page?: string; lead?: string }

export default async function LeadsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const { supabase } = await requireAdmin()
  const filters = await searchParams
  const status = typeof filters.status === 'string' && Object.hasOwn(leadStatuses, filters.status) ? filters.status : ''
  const search = typeof filters.q === 'string' ? filters.q.trim().slice(0, 100) : ''
  const page = typeof filters.page === 'string' && /^[1-9]\d{0,3}$/.test(filters.page) ? Number(filters.page) : 1
  const offset = (page - 1) * perPage
  const selected = typeof filters.lead === 'string' && leadTokenPattern.test(filters.lead) ? filters.lead : ''
  let query = supabase.from('contact_leads').select('id,name,email,whatsapp,project_type,service,brief,budget,deadline,status,owner_notes,created_at,updated_at')
  if (status) query = query.eq('status', status)
  if (search) {
    // Quote the PostgREST value and escape literal LIKE wildcards.
    const like = JSON.stringify('%' + search.replace(/[\\%_*]/g, '\\$&') + '%')
    query = query.or(`name.ilike.${like},email.ilike.${like}`)
  }
  const { data, error } = await query.order('created_at', { ascending: false }).order('id', { ascending: false }).range(offset, offset + perPage)
  const pageLink = (number: number) => '/admin/leads?' + new URLSearchParams({ q: search, status, page: String(number) })

  return <div data-content-admin>
    <p><Link href="/admin">← Admin dashboard</Link></p>
    <h1>Leads</h1>
    <form action="/admin/leads" method="get" className={styles.editor} aria-label="Filter leads">
      <fieldset>
        <label>Search by name or email<input name="q" type="search" maxLength={100} defaultValue={search} /></label>
        <label>Filter by status<select name="status" defaultValue={status}>
          <option value="">All statuses</option>
          {Object.entries(leadStatuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select></label>
        <div className={styles.controls}><button className="glass" type="submit">Apply filters</button><Link className="glass" href="/admin/leads">Clear filters</Link></div>
      </fieldset>
    </form>
    {error ? <p role="alert">Inquiries are unavailable. Check that the Leads migration has been applied.</p> : !data.length ? <p>No inquiries match.</p> :
      <ul className={styles.contentList}>
        {data.slice(0, perPage).map((lead) => <li key={lead.id} id={'lead-' + lead.id}>
          <details open={lead.id === selected || undefined}>
            <summary>{lead.name} <span>· {leadStatuses[lead.status as keyof typeof leadStatuses]} · <time dateTime={lead.created_at}>{lead.created_at.slice(0, 10)}</time></span></summary>
            <p>{lead.project_type}{lead.service ? ' · ' + lead.service : ''}</p>
            <p style={{ whiteSpace: 'pre-wrap' }}>{lead.brief}</p>
            {lead.budget && <p>Budget {lead.budget}</p>}
            {lead.deadline && <p>Deadline {lead.deadline}</p>}
            <div className={styles.controls}>
              {lead.email && contactValue('email', lead.email) && <a className="glass" href={`mailto:${lead.email.replaceAll('+', '%2B')}?subject=Project%20inquiry`}>Email {lead.email}</a>}
              {lead.whatsapp && phonePattern.test(lead.whatsapp) && <a className="glass" href={'https://wa.me/' + lead.whatsapp.slice(1)}
                target="_blank" rel="noopener noreferrer">WhatsApp {lead.whatsapp}</a>}
            </div>
            <LeadForm id={lead.id} status={lead.status} notes={lead.owner_notes} updatedAt={lead.updated_at} />
          </details>
        </li>)}
      </ul>}
    <nav className={styles.controls} aria-label="Leads pages">
      {page > 1 && <Link className="glass" href={pageLink(page - 1)}>Previous</Link>}
      {!!data && data.length > perPage && <Link className="glass" href={pageLink(page + 1)}>Next</Link>}
    </nav>
  </div>
}
