import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Navigation } from '../../../components/navigation'
import { ProjectMedia } from '../../../components/project-media'
import { studyFields } from '../../../domain/portfolio-cms'
import { publicCaseStudy } from '../../../server/portfolio-cms'
import { preventIndexing, publicMetadata } from '../../../server/site-metadata'

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const study = await publicCaseStudy(slug)
  if (!study) return { robots: preventIndexing }
  const copy = (study.description?.trim() || study.overview?.trim() || `Project case study for ${study.title}.`).replace(/\s+/g, ' ')
  const description = copy.length > 160 ? copy.slice(0, 157).trimEnd() + '…' : copy
  return publicMetadata(`/work/${slug}`, study.title, description, study.poster_url)
}

export default async function CaseStudyPage({ params }: Props) {
  const { slug } = await params
  const study = await publicCaseStudy(slug)
  if (!study) notFound()
  return <>
    <Navigation initial="work" />
    <main id="main" className="work-page container portfolio-study" tabIndex={-1}>
      <Link className="glass" href="/work">← Work</Link>
      <h1 className="metallic-heading" dir="auto" tabIndex={-1}>{study.title}</h1>
      {study.description && <p className="section-copy" dir="auto">{study.description}</p>}
      {(Object.keys(studyFields) as (keyof typeof studyFields)[]).map((field) => study[field] && <section key={field}>
        <h2>{studyFields[field]}</h2><p dir="auto">{study[field]}</p>
      </section>)}
      <div className="portfolio-gallery">{study.media.map((media) => <ProjectMedia key={media.id} media={media} />)}</div>
    </main>
  </>
}
