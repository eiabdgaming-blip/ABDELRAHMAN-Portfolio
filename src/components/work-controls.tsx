'use client'

import Link from 'next/link'
import type { PlayerItem } from '../domain/display'
import { textDirection, type LocalizedText } from '../domain/locale'
import { useMediaExperience } from './media-experience'
import { PlayIcon } from './icons'

export function WorkControls({ format, sort, categories, selected }: {
  format: string; sort: string; categories: readonly (readonly [string, string])[]; selected: readonly string[]
}) {
  return (
    <form className="work-controls" action="/work" method="get" aria-label="Filter work">
      <input type="hidden" name="format" value={format} />
      <Link className="glass" href={`/work?format=${format}&sort=${sort}`} aria-current={!selected.length ? 'true' : undefined}>All</Link>
      {categories.length > 0 && <details className="work-categories">
        <summary className="glass">Categories{selected.length ? ` (${selected.length})` : ''} <span aria-hidden="true">⌄</span></summary>
        <div className="category-options">
          {categories.map(([id, label]) => <label key={id}><input type="checkbox" name="category" value={id} defaultChecked={selected.includes(id)} /> {label}</label>)}
          <button className="glass" type="submit">Apply filters</button>
        </div>
      </details>}
      <select className="glass work-sort" name="sort" aria-label="Sort work" defaultValue={sort} onChange={(event) => event.currentTarget.form?.requestSubmit()}>
        <option value="curated">Sort: Curated</option><option value="newest">Sort: Newest</option>
      </select>
      <noscript><button className="glass" type="submit">Apply sort</button></noscript>
    </form>
  )
}

export function WorkProject({ items, index, description }: { items: readonly PlayerItem[]; index: number; description?: LocalizedText }) {
  const { showVideo } = useMediaExperience()
  const item = items[index]
  return (
    <article className="long-form-project">
      <button className="long-form-cover" aria-label={`Open ${item.title}`} onClick={(event) => showVideo(items, index, event.currentTarget)}>
        <img src={item.poster} alt="" loading="lazy" /><span className="glass round-play"><PlayIcon /></span>
      </button>
      <h2 lang={item.locale} dir={textDirection[item.locale]}>{item.title}</h2>
      {description && <p lang={description.locale} dir={textDirection[description.locale]}>{description.value}</p>}
      <button className="glass" onClick={(event) => showVideo(items, index, event.currentTarget)}>Watch project</button>
    </article>
  )
}
