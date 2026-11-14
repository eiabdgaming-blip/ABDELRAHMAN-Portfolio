'use client'

import { startTransition, useActionState, useState, type ReactNode } from 'react'
import { type AssetOption, type PortfolioStatus, type Study, studyFields, profileFields, profileKeys } from '../../domain/portfolio-cms'
import { workCategories } from '../../domain/work-categories'
import styles from './admin.module.css'
import { savePortfolio, type PortfolioResult } from './portfolio-actions'
import { AttachmentInput } from './feedback/attachment-input'

type Option = { id: string; title: string; status?: string; duration?: number }
type Entry = { id: string; revision: number; status: PortfolioStatus; display_order: number; featured: boolean }
export type ProjectEntry = Entry & {
  slug: string; title: string; description: string; category: string | null; project_format: string;
  presentation: string; cover_id: string | null;
  portfolio_project_media: { asset_id: string; display_order: number }[];
  portfolio_case_studies: Study | null;
}
export type FeedbackEntry = Entry & {
  client_name: string; affiliation: string; quote: string; profile_url: string | null;
  avatar_id: string | null; proof_id: string | null; proof_approved: boolean;
  project_id: string | null; work_asset_id: string | null;
  instagram_url?: string | null; tiktok_url?: string | null; linkedin_url?: string | null;
  voice_id?: string | null; voice_approved?: boolean;
  portfolio_feedback_services: { service_id: string }[];
}
const initial: PortfolioResult = { message: '' }

function AssetSelect({ name, label, options, value, onChange }: {
  name: string; label: string; options: Option[]; value?: string | null; onChange?: (value: string) => void;
}) {
  return <label>{label}<select name={name} defaultValue={value ?? ''} onChange={(event) => onChange?.(event.target.value)}>
    <option value="">None</option>
    {value && !options.some(({ id }) => id === value) && <option value={value}>Previously selected</option>}
    {options.map(({ id, title, status }) => <option value={id} key={id}>{title}{status ? ` · ${status}` : ''}</option>)}
  </select></label>
}

function EntryForm({ kind, entry, label, children }: { kind: 'project' | 'feedback'; entry?: Entry; label: string; children: ReactNode }) {
  const [result, action, pending] = useActionState(savePortfolio.bind(null, kind, entry?.id ?? null, entry?.revision ?? 0), initial)
  const [uploadMessage, setUploadMessage] = useState('')
  const created = !entry && result.ok
  return <form method="post" className={styles.editor} aria-label={label}
    onSubmit={(event) => {
      event.preventDefault()
      if (event.currentTarget.querySelector('[data-attachment-upload]')) {
        setUploadMessage('Wait for the attachment upload to finish before saving.')
        return
      }
      setUploadMessage('')
      const data = new FormData(event.currentTarget, (event.nativeEvent as SubmitEvent).submitter)
      if (data.get('intent') === 'delete') {
        if (!window.confirm('Delete this testimonial permanently?')) return
        data.set('confirm_delete', 'yes')
      }
      startTransition(() => action(data))
    }}>
    <fieldset disabled={pending || created}>
      {children}
      <label>Status<select name="status" defaultValue={entry?.status ?? 'draft'}>
        <option value="draft">Draft</option><option value="published">Published</option><option value="hidden">Hidden</option>
      </select></label>
      <label>Display order (lower first)<input name="display_order" type="number" min={0} max={99999} defaultValue={entry?.display_order ?? 0} required /></label>
      <label className={styles.portfolioCheck}><input type="checkbox" name="featured" value="yes" defaultChecked={entry?.featured} /> Featured on Home</label>
      <div className={styles.controls}>
        <button className="glass" name="intent" value="save">{pending ? 'Saving…' : entry ? 'Save changes' : 'Create entry'}</button>
        {entry && kind === 'feedback' && <button className="glass" name="intent" value="delete" formNoValidate>Delete testimonial</button>}
      </div>
    </fieldset>
    {result.message && <p role={result.ok ? 'status' : 'alert'}>{result.message}</p>}
    {uploadMessage && <p role="alert">{uploadMessage}</p>}
    {created && <a href={kind === 'project' ? '/admin/projects' : '/admin/feedback'}>Add another entry</a>}
  </form>
}

export function ProjectEditor({ entry, assets }: { entry?: ProjectEntry; assets: AssetOption[] }) {
  const [rows, setRows] = useState(() => (entry?.portfolio_project_media ?? [])
    .slice().sort((a, b) => a.display_order - b.display_order || a.asset_id.localeCompare(b.asset_id))
    .map((row, key) => ({ ...row, key })))
  return <EntryForm kind="project" entry={entry} label={entry?.title ?? 'New project'}>
    <label>Title<input name="title" defaultValue={entry?.title} maxLength={120} required /></label>
    <label>Slug<input name="slug" defaultValue={entry?.slug} maxLength={80} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" required readOnly={!!entry} /></label>
    <label>Description<textarea name="description" defaultValue={entry?.description} maxLength={2000} rows={3} /></label>
    <label>Category<select name="category" defaultValue={entry?.category ?? ''}>
      <option value="">None</option>{workCategories.map(([id, title]) => <option key={id} value={id}>{title}</option>)}
    </select></label>
    <label>Project type<select name="project_format" defaultValue={entry?.project_format ?? 'long-form'}>
      <option value="long-form">Long-form</option><option value="reel">Reel</option>
    </select></label>
    <label>Open as<select name="presentation" defaultValue={entry?.presentation ?? 'player'}>
      <option value="player">Media player</option><option value="case-study">Case Study</option>
    </select></label>
    <AssetSelect name="cover_id" label="Cover or poster" options={assets} value={entry?.cover_id} />
    <div className={styles.portfolioMedia}>
      <h3>Project media</h3>
      <p>Publish the selected assets in Media Library before publishing the project. The first video in order is the lead.</p>
      {rows.map((row, index) => <div className={styles.portfolioRow} key={row.key}>
        <AssetSelect name="media_id" label={`Asset ${index + 1}`} options={assets} value={row.asset_id}
          onChange={(asset_id) => setRows(rows.map((item) => item.key === row.key ? { ...item, asset_id } : item))} />
        <label>Order<input name="media_order" type="number" min={0} max={99999} defaultValue={row.display_order} required
          onChange={(event) => setRows(rows.map((item) => item.key === row.key ? { ...item, display_order: Number(event.target.value) } : item))} /></label>
        <button type="button" className="glass" onClick={() => setRows(rows.filter(({ key }) => key !== row.key))}>Remove</button>
      </div>)}
      <button type="button" className="glass" disabled={rows.length >= 24} onClick={() => setRows([...rows,
        { key: Math.max(-1, ...rows.map(({ key }) => key)) + 1, asset_id: '', display_order: rows.length * 10 }])}>Add media</button>
    </div>
    <details><summary>Case Study text</summary>
      {(Object.keys(studyFields) as (keyof Study)[]).map((key) => <label key={key}>{studyFields[key]}
        <textarea name={key} maxLength={4000} rows={3} defaultValue={entry?.portfolio_case_studies?.[key]} />
      </label>)}
    </details>
  </EntryForm>
}

export function FeedbackEditor({ entry, assets, projects, work, services, recordings }: {
  entry?: FeedbackEntry; assets: AssetOption[]; projects: Option[]; work: Option[]; services: Option[]; recordings: Option[];
}) {
  const images = assets.filter(({ resource_type }) => resource_type === 'image')
  const [avatar, setAvatar] = useState(entry?.avatar_id ?? '')
  const [proof, setProof] = useState(entry?.proof_id ?? '')
  const [approved, setApproved] = useState(entry?.proof_approved ?? false)
  const [voice, setVoice] = useState(entry?.voice_id ?? '')
  const [voiceApproved, setVoiceApproved] = useState(entry?.voice_approved ?? false)
  return <EntryForm kind="feedback" entry={entry} label={entry?.client_name ?? 'New testimonial'}>
    <label>Client name<input name="client_name" defaultValue={entry?.client_name} maxLength={120} required /></label>
    <label>Role or company<input name="affiliation" defaultValue={entry?.affiliation} maxLength={160} /></label>
    {profileKeys.map((key) => <label key={key}>{profileFields[key]} profile<input name={key} type="url"
      defaultValue={entry?.[key] ?? ''} maxLength={240} /></label>)}
    <label>Testimonial<textarea name="quote" defaultValue={entry?.quote} maxLength={3000} rows={4} required /></label>
    <div className={styles.portfolioMedia}>
      <h3>Services</h3>
      {services.map(({ id, title }) => <label className={styles.portfolioCheck} key={id}>
        <input type="checkbox" name="services" value={id} defaultChecked={entry?.portfolio_feedback_services.some(({ service_id }) => service_id === id)} /> {title}
      </label>)}
    </div>
    <AttachmentInput name="avatar_id" label="Client photo" uploadLabel="Upload client photo" options={images} value={avatar} onChange={setAvatar} />
    <AttachmentInput name="proof_id" label="Redacted chat screenshot" uploadLabel="Upload chat screenshot" options={images} value={proof}
      onChange={(value) => { setProof(value); setApproved(false) }} />
    <label className={styles.portfolioCheck}><input type="checkbox" name="proof_approved" value="yes"
      checked={approved} disabled={!proof} onChange={(event) => setApproved(event.target.checked)} />
      I approve this redacted screenshot for public display</label>
    <AttachmentInput name="voice_id" label="Voice note" uploadLabel="Upload voice note (MP3, WAV or OGG)" options={recordings} value={voice} audio
      onChange={(value) => { setVoice(value); setVoiceApproved(false) }} />
    <label className={styles.portfolioCheck}><input type="checkbox" name="voice_approved" value="yes" checked={voiceApproved}
      disabled={!voice} onChange={(event) => setVoiceApproved(event.target.checked)} /> I approve this recording for public playback</label>
    <AssetSelect name="project_id" label="Published project reference" options={projects} value={entry?.project_id} />
    <AssetSelect name="work_asset_id" label="Standalone published Work reference (alternative)" options={work} value={entry?.work_asset_id} />
  </EntryForm>
}
