import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireAdmin } from '../../../../lib/admin-access'
import type { FAQRow, ServiceRow } from '../../../../domain/site-content'
import styles from '../../admin.module.css'
import { DeleteQuestion, EntryForm, SettingsForm } from '../forms'

export default async function ContentPage({ params }: { params: Promise<{ section: string }> }) {
  const { supabase } = await requireAdmin()
  const { section } = await params
  if (section !== 'services' && section !== 'faq' && section !== 'settings') notFound()
  const title = { services: 'Services', faq: 'FAQ', settings: 'Site Settings' }[section]
  const back = <p><Link href="/admin">← Admin dashboard</Link></p>
  const unavailable = <p role="alert">Site content is unavailable. Check that the site content migration has been applied.</p>
  if (section === 'settings') {
    const { data } = await supabase.from('site_contact').select('email,whatsapp,instagram,tiktok').eq('id', true).maybeSingle()
    return <>{back}<h1>{title}</h1>
      {data ? <>
        <p>Use an international <code>https://wa.me/</code> number without a plus sign, an Instagram profile URL and a TikTok <code>/@username</code> profile URL. Changes are public when saved.</p>
        <SettingsForm contact={data} />
      </> : unavailable}
    </>
  }
  const { data, error } = section === 'services'
    ? await supabase.from('site_services').select('id,title,description,display_order,visible').order('display_order').order('id')
    : await supabase.from('site_faq').select('id,question,answer,display_order,published').order('display_order').order('id')
  const entries = ((data ?? []) as (ServiceRow | FAQRow)[]).map((row) => 'title' in row
    ? { id: row.id, title: row.title, text: row.description, order: row.display_order, public: row.visible }
    : { id: row.id, title: row.question, text: row.answer, order: row.display_order, public: row.published })
  const nextOrder = Math.min(99999, (entries.at(-1)?.order ?? 0) + 10)
  return <div data-content-admin>{back}<h1>{title}</h1>
    {error ? unavailable : <>
      <h2>{section === 'services' ? 'Add a service' : 'Add a question'}</h2>
      <EntryForm section={section} nextOrder={nextOrder} />
      <h2>{section === 'services' ? 'Existing services' : 'Existing questions'}</h2>
      <ul className={styles.contentList}>
        {entries.map((entry) => <li key={entry.id}>
          <details>
            <summary>{entry.title} <span>{entry.order} · {entry.public ? section === 'services' ? 'Visible' : 'Published' : 'Hidden'}</span></summary>
            <EntryForm section={section} entry={entry} nextOrder={nextOrder} />
            {section === 'faq' && <DeleteQuestion id={entry.id} question={entry.title} />}
          </details>
        </li>)}
      </ul>
    </>}
  </div>
}
