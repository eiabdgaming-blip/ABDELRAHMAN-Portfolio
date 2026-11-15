import type { Metadata } from 'next'
import Link from 'next/link'
import { requireAdmin } from '../../../lib/admin-access'
import { cloudinaryConfig } from '../../../lib/media/cloudinary'
import { mediaWriter } from '../../../lib/media/writer'
import { UploadForm } from './upload-form'
import { MediaAssets } from './media-assets'
import styles from './media.module.css'

export const metadata: Metadata = { title: 'Media Library' }
const pageSize = 24

export default async function MediaPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { supabase } = await requireAdmin()
  const requested = Number((await searchParams).page ?? 1)
  const page = Number.isSafeInteger(requested) && requested > 0 && requested <= 100_000 ? requested : 1
  const offset = (page - 1) * pageSize
  const { data, error } = await supabase.from('media_assets')
    .select('id,title,resource_type,format,bytes,width,height,duration,created_at,status,placement,project_format,featured,display_order,category,description,poster_asset_id,publication_revision')
    .order('created_at', { ascending: false }).order('id', { ascending: false }).range(offset, offset + pageSize)
  const canManage = !error && !!mediaWriter()
  const ready = canManage && !!cloudinaryConfig()
  const { data: posters } = await supabase.from('media_assets').select('id,title')
    .eq('resource_type', 'image').eq('status', 'published').order('title')

  return (
    <div className={styles.library} data-media-library>
      <header><Link href="/admin">← Admin dashboard</Link><h1>Media Library</h1></header>
      {!ready && <p role="alert" className={styles.error}>
        {error ? 'The library is unavailable. Check the media migration and try again.' : 'Configure the server credentials to enable uploads.'}
      </p>}
      <UploadForm ready={ready} />
      <h2>Media assets</h2>
      {!error && !data?.length && <p>{page === 1 ? 'No media yet.' : 'No more media.'}</p>}
      <MediaAssets assets={data?.slice(0, pageSize) ?? []} canManage={canManage} canPublish={ready} posters={posters ?? []} />
      <nav aria-label="Media pages" className={styles.actions}>
        {page > 1 && <Link className="glass" href={`/admin/media?page=${page - 1}`}>Previous</Link>}
        {data && data.length > pageSize && <Link className="glass" href={`/admin/media?page=${page + 1}`}>Next</Link>}
      </nav>
    </div>
  )
}
