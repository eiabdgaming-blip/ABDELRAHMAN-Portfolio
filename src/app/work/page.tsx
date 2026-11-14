import type { Metadata } from 'next'
import Link from 'next/link'
import { Navigation } from '../../components/navigation'
import { ReelRail } from '../../components/reel-rail'
import { WorkControls, WorkProject } from '../../components/work-controls'
import { projectPlayerItem } from '../../domain/display'
import type { WorkQuery } from '../../domain/portfolio'
import { localReview, portfolioRepository } from '../../server/review'
import { publishedWork } from '../../server/published-media'
import { workCategories } from '../../domain/work-categories'

export const metadata: Metadata = { title: 'Work' }

type Query = Record<string, string | string[] | undefined>

function first(value: Query[string]) {
  return Array.isArray(value) ? value[0] : value
}

export default async function WorkPage({ searchParams }: { searchParams: Promise<Query> }) {
  const [review, params] = await Promise.all([localReview(), searchParams])
  const format = first(params.format) === 'long-form' ? 'long-form' : 'reels'
  const tags = [params.category ?? []].flat()
  const selected = workCategories.filter(([id]) => tags.includes(id)).map(([id]) => id)
  const sort = first(params.sort) === 'newest' ? 'newest' : 'curated'
  const cursor = first(params.cursor)
  const query: WorkQuery = { format: format === 'reels' ? 'reel' : 'long-form', tagSlugs: selected, sort, cursor }
  const published = await publishedWork(query)
  const { items, nextCursor } = review && !published.items.length
    ? await portfolioRepository(true).listWork(query) : published
  const videos = items.map(projectPlayerItem)
  const filterQuery = new URLSearchParams({ format, sort })
  selected.forEach((tag) => filterQuery.append('category', tag))
  const key = filterQuery.toString() + (cursor ?? '')
  if (nextCursor) filterQuery.set('cursor', nextCursor)
  return (
    <>
      <Navigation initial="work" />
      <main id="main" className="work-page container">
        <h1 className="metallic-heading" tabIndex={-1}>WORK</h1>
        <p className="section-copy">Browse by format and project type.</p>
        <nav className="work-formats" aria-label="Work format">
          <Link className="glass" href="/work?format=reels" aria-current={format === 'reels' ? 'page' : undefined}>Reels &amp; Shorts</Link>
          <Link className="glass" href="/work?format=long-form" aria-current={format === 'long-form' ? 'page' : undefined}>Long-form &amp; YouTube</Link>
        </nav>
        <WorkControls key={key} format={format} sort={sort} categories={workCategories} selected={selected} />
        {!videos.length ? <div className="work-empty empty-state" role="status">
          <p>{selected.length ? 'No projects match these categories.' : format === 'long-form'
            ? 'No long-form projects are available yet.' : 'No reels are available yet.'}</p>
        </div> : format === 'reels' ? <ReelRail key={key + videos.map(({ id }) => id).join(',')} items={videos} initial={selected.length || sort === 'newest' ? 0 : 1} />
          : <div className="long-form-grid">{videos.map((item, index) =>
            <WorkProject key={item.id} items={videos} index={index} description={items[index].description} />)}</div>}
        {nextCursor && <div className="work-line"><strong>{format === 'reels' ? 'More reels in this tab' : 'Published projects'}</strong>
          <Link className="glass" href={`/work?${filterQuery}`}>Load more</Link></div>}
        <div className="work-line work-cta"><strong>Ready to start a project?</strong><Link className="glass" href="/#contact">Contact ↗</Link></div>
      </main>
    </>
  )
}
