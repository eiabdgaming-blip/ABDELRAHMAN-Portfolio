import Link from 'next/link'
import { requireAdmin } from '../../../lib/admin-access'
import styles from '../admin.module.css'
import { ProjectEditor, type ProjectEntry } from '../portfolio-editor'

export default async function ProjectsPage() {
  const { supabase } = await requireAdmin()
  const [projects, media] = await Promise.all([
    supabase.from('portfolio_projects').select('*,portfolio_project_media(asset_id,display_order),portfolio_case_studies(overview,requirements,role,approach,process,outcome)')
      .order('display_order').order('id'),
    supabase.from('media_assets').select('id,title,status,resource_type').order('title').order('id'),
  ])
  return <div data-content-admin>
    <p><Link href="/admin">← Admin dashboard</Link></p>
    <h1>Projects</h1>
    {projects.error || media.error ? <p role="alert">Projects are unavailable. Check that the projects and feedback migration is applied.</p> : <>
      <p>{projects.data.length} projects</p>
      <details><summary>New project</summary><ProjectEditor assets={media.data} /></details>
      <ul className={styles.contentList}>
        {(projects.data as unknown as ProjectEntry[]).map((entry) => <li key={entry.id}>
          <details><summary>{entry.title} <span>{entry.display_order} · {entry.status}</span></summary>
            <ProjectEditor entry={entry} assets={media.data} />
          </details>
        </li>)}
      </ul>
    </>}
  </div>
}
