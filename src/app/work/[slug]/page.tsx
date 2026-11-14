import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Navigation } from '../../../components/navigation'
import { ProjectMedia } from '../../../components/portfolio-projects'
import { slugPattern, studyFields } from '../../../domain/portfolio-cms'
import { publicCaseStudy } from '../../../server/portfolio-cms'

export default async function CaseStudyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if (slug.length > 80 || !slugPattern.test(slug)) notFound()
  const study = await publicCaseStudy(slug)
  if (!study) notFound()
  return <>
    <Navigation initial="work" />
    <main id="main" className="work-page container portfolio-study">
      <Link className="glass" href="/work">← Work</Link>
      <h1 className="metallic-heading" dir="auto">{study.title}</h1>
      {study.description && <p className="section-copy" dir="auto">{study.description}</p>}
      {(Object.keys(studyFields) as (keyof typeof studyFields)[]).map((field) => study[field] && <section key={field}>
        <h2>{studyFields[field]}</h2><p dir="auto">{study[field]}</p>
      </section>)}
      <div className="portfolio-gallery">{study.media.map((media) => <ProjectMedia key={media.id} media={media} />)}</div>
    </main>
  </>
}
