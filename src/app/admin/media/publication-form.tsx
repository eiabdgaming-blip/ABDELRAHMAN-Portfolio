'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { workCategories } from '../../../domain/work-categories'
import { changePublication, type PublicationResult } from './publication-actions'
import styles from './media.module.css'

type Publication = {
  id: string; title: string; resource_type: string; status: string; publication_revision: number;
  placement: string; project_format: string; featured: boolean; display_order: number;
  category: string | null; description: string | null; poster_asset_id: string | null;
}

export function PublicationForm({ asset, posters }: { asset: Publication; posters: { id: string; title: string }[] }) {
  const [result, setResult] = useState<PublicationResult>()
  const [pending, startTransition] = useTransition()
  const video = asset.resource_type === 'video'
  const published = asset.status === 'published'
  const [placement, setPlacement] = useState(asset.placement)
  const [format, setFormat] = useState(asset.project_format)
  const home = placement !== 'work'
  const preparing = !published && result?.preparing

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const button = (event.nativeEvent as SubmitEvent).submitter
    const form = new FormData(event.currentTarget, button)
    const command = form.get('command')
    const confirmation = command === 'hide' ? 'Hide this media from public listings? Previously shared CDN links may still work.'
      : command === 'publish' ? 'Prepare and publish this media? Its optimized Cloudinary copy will become publicly accessible.'
        : 'Save these display settings? Changes to published media will appear on the website.'
    if (!window.confirm(confirmation)) return
    form.set('confirmed', 'yes')
    setResult(undefined)
    startTransition(async () => {
      try {
        setResult(await changePublication(asset.id, asset.publication_revision, form))
      } catch {
        setResult({ message: 'The request could not be completed. Refresh and check the current status.', error: true })
      }
    })
  }

  return (
    <details className={styles.publication}>
      <summary>Publication settings</summary>
      <form onSubmit={submit} aria-label={`Publication settings for ${asset.title}`}>
        <fieldset key={asset.publication_revision} disabled={pending}>
          <label>Title<input name="title" maxLength={120} defaultValue={asset.title} required /></label>
          {video ? <>
            <label>Placement<select name="placement" value={placement} onChange={(event) => {
              setPlacement(event.target.value)
              if (event.target.value !== 'work') setFormat('reel')
            }}>
              <option value="home">Home Reels</option><option value="work">Work</option><option value="both">Home Reels and Work</option>
            </select></label>
            <label>Format<select name="project_format" value={format} onChange={(event) => setFormat(event.target.value)}>
              <option value="reel">Reel</option><option value="long-form" disabled={home}>Long-form</option>
            </select></label>
            {home && <label className={styles.check}><input type="checkbox" name="featured" value="yes" defaultChecked={asset.featured || placement === 'home'} /> Feature on Home (max 6)</label>}
            <label>Display order (lower first)<input type="number" name="display_order" min={0} max={99999} defaultValue={asset.display_order} required /></label>
            <label>Work category<select name="category" defaultValue={asset.category ?? ''}>
              <option value="">None</option>{workCategories.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select></label>
            <label>Long-form description<textarea name="description" maxLength={1000} defaultValue={asset.description ?? ''} /></label>
            <label>Poster<select name="poster_asset_id" defaultValue={asset.poster_asset_id ?? ''}>
              <option value="">Automatic video frame</option>
              {asset.poster_asset_id && !posters.some(({ id }) => id === asset.poster_asset_id) &&
                <option value={asset.poster_asset_id}>Previously selected image</option>}
              {posters.map(({ id, title }) => <option key={id} value={id}>{title}</option>)}
            </select></label>
          </> : <p>Publish this image to make it available as a video poster.</p>}
          <div className={styles.actions}>
            <button className="glass" name="command" value="save">Save settings</button>
            {published ? <button className="glass" name="command" value="hide" formNoValidate>Hide</button>
              : <button className="glass" name="command" value="publish">{preparing ? 'Check and publish' : 'Publish'}</button>}
          </div>
        </fieldset>
        {pending && <p role="status">Applying change…</p>}
        {!pending && result && <p role={result.error ? 'alert' : 'status'} className={result.error ? styles.error : undefined}>{result.message}</p>}
      </form>
    </details>
  )
}
