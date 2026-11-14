'use client'

import { useState } from 'react'
import Link from 'next/link'
import { publicPlayerItem, type PublicProject } from '../domain/portfolio-cms'
import { ProjectMedia } from './project-media'
import { useMediaExperience } from './media-experience'
import { PlayIcon } from './icons'

export function PortfolioCard({ project }: { project: PublicProject }) {
  const { showVideo } = useMediaExperience()
  const [gallery, setGallery] = useState(false)
  const caseStudy = project.presentation === 'case-study' && project.slug ? '/work/' + project.slug : null
  const videos = project.media.filter(({ kind }) => kind === 'video')
  const images = project.media.filter(({ kind }) => kind === 'image')
  const playlist = (videos.length ? videos : project.lead ? [project.lead] : []).map((video, i) =>
    publicPlayerItem(video, i === 0 ? project.title : video.title, i === 0 ? project.poster_url : video.poster))
  const cover = <picture>
    {project.poster_small_url && <source media="(max-width: 767px) and (max-resolution: 1.5dppx)" srcSet={project.poster_small_url} />}
    <img src={project.poster_url} alt="" loading="lazy" decoding="async" />
  </picture>
  return <article className="long-form-project">
    {caseStudy ? <Link className="long-form-cover" href={caseStudy} aria-label={`Open ${project.title}`}>{cover}</Link>
      : playlist.length ? <button className="long-form-cover" aria-label={`Open ${project.title}`}
        onClick={(event) => showVideo(playlist, 0, event.currentTarget)}>{cover}<span className="glass round-play"><PlayIcon /></span></button>
        : <button className="long-form-cover" aria-label={`Open ${project.title}`} aria-expanded={gallery}
          onClick={() => setGallery(!gallery)}>{cover}</button>}
    <h2 dir="auto">{project.title}</h2>
    {project.description && <p dir="auto">{project.description}</p>}
    {caseStudy && <Link className="glass portfolio-action" href={caseStudy}>View case study ↗</Link>}
    {!caseStudy && playlist.length > 0 && <button className="glass" onClick={(event) => showVideo(playlist, 0, event.currentTarget)}>Watch project</button>}
    {!caseStudy && images.length > 0 && playlist.length > 0 && <button className="glass" aria-expanded={gallery}
      onClick={() => setGallery(!gallery)}>{gallery ? 'Hide images' : 'View images'}</button>}
    {gallery && <div className="portfolio-gallery">{images.map((media) => <ProjectMedia key={media.id} media={media} />)}</div>}
  </article>
}

export function SelectedProjects({ projects }: { projects: PublicProject[] }) {
  if (!projects.length) return null
  return <section className="container portfolio-selected" id="selected-work" aria-labelledby="selected-work-heading">
    <div className="section-intro"><h2 className="metallic-heading" id="selected-work-heading">SELECTED WORK</h2></div>
    <div className="long-form-grid">{projects.map((project) => <PortfolioCard key={project.id} project={project} />)}</div>
  </section>
}
