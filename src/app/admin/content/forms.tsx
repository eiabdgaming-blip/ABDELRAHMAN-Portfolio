'use client'

import { useActionState, useEffect, useRef } from 'react'
import { siteFields, type SiteContact, type SiteField } from '../../../domain/site-content'
import styles from '../admin.module.css'
import { saveContent, type ContentResult } from './actions'

type Entry = { id: string; title: string; text: string; order: number; public: boolean }
const initial: ContentResult = { message: '' }

function Feedback({ result }: { result: ContentResult }) {
  return result.message && <p role={result.ok ? 'status' : 'alert'} className={result.ok ? undefined : styles.error}>{result.message}</p>
}

export function EntryForm({ section, entry, nextOrder }: { section: 'services' | 'faq'; entry?: Entry; nextOrder: number }) {
  const [result, action, pending] = useActionState(saveContent.bind(null, section, entry?.id ?? null), initial)
  const form = useRef<HTMLFormElement>(null)
  const service = section === 'services'
  useEffect(() => {
    if (result.ok && !entry) form.current?.reset()
  }, [result, entry])
  return (
    <form action={action} ref={form} className={styles.editor} aria-label={entry?.title ?? (service ? 'Add service' : 'Add question')}>
      <fieldset disabled={pending}>
        <label>{service ? 'Title' : 'Question'}<input name="title" required maxLength={service ? 120 : 200} defaultValue={entry?.title} /></label>
        <label>{service ? 'Description' : 'Answer'}<textarea name="text" required rows={3} maxLength={service ? 1000 : 2000} defaultValue={entry?.text} /></label>
        <label>Display order (lower first)<input name="order" type="number" min={0} max={99999} required defaultValue={entry?.order ?? nextOrder} /></label>
        <label>Visibility<select name="public" defaultValue={entry?.public ? 'yes' : 'no'}>
          <option value="no">Hidden</option><option value="yes">{service ? 'Visible' : 'Published'}</option>
        </select></label>
        <div className={styles.controls}>
          <button className="glass" name="intent" value="save">{entry ? 'Save changes' : service ? 'Add service' : 'Add question'}</button>
        </div>
      </fieldset>
      <Feedback result={result} />
    </form>
  )
}

export function DeleteQuestion({ id, question }: { id: string; question: string }) {
  const [result, action, pending] = useActionState(saveContent.bind(null, 'faq', id), initial)
  return (
    <details className={styles.deleteQuestion}>
      <summary>Delete question</summary>
      <form action={action} aria-label={`Delete ${question}`}>
        <label><input type="checkbox" name="confirmDelete" value="yes" required /> Confirm permanent deletion</label>
        <button className="glass" name="intent" value="delete" disabled={pending}>Delete permanently</button>
        <Feedback result={result} />
      </form>
    </details>
  )
}

export function SettingsForm({ contact }: { contact: SiteContact }) {
  const [result, action, pending] = useActionState(saveContent.bind(null, 'settings', null), initial)
  return (
    <form action={action} className={styles.editor} aria-label="Public contact settings">
      <fieldset disabled={pending}>
        {(Object.keys(siteFields) as SiteField[]).map((key) => {
          const { label, type, max } = siteFields[key]
          return <label key={key}>{label}<input name={key} type={type} maxLength={max} required defaultValue={contact[key]} /></label>
        })}
        <div className={styles.controls}><button className="glass">Save settings</button></div>
      </fieldset>
      <Feedback result={result} />
    </form>
  )
}
