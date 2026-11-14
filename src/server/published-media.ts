import 'server-only'
import { createClient } from '@supabase/supabase-js'
import type { PublishedProject, WorkQuery, WorkPage } from '../domain/portfolio'
import { supabaseConfig } from '../lib/supabase/config'

const readEnv = (name: string) => process.env[name]
const columns = 'id,title,description,project_format,category,playback_url,poster_url,poster_small_url,width,height,duration'

type Listing = {
  id: string; title: string; description: string | null; project_format: PublishedProject['format']; category: string | null;
  playback_url: string; poster_url: string; poster_small_url: string; width: number; height: number; duration: number;
}

function publicClient() {
  const config = supabaseConfig(readEnv('NEXT_PUBLIC_SUPABASE_URL'), readEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'))
  if (!config) return null
  return createClient(config.url, config.key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store', signal: AbortSignal.timeout(5000) }) },
  })
}

function project(row: Listing): PublishedProject {
  const text = (value: string) => ({ value, locale: /\p{Script=Arabic}/u.test(value) ? 'ar' as const : 'en' as const })
  return {
    id: row.id, slug: row.id, format: row.project_format, title: text(row.title),
    description: row.description ? text(row.description) : undefined,
    tagSlugs: row.category ? [row.category] : [], media: [],
    poster: { id: row.id, kind: 'image', url: row.poster_url, smallUrl: row.poster_small_url },
    leadPlayback: { id: row.id, kind: 'video', url: row.playback_url, width: row.width, height: row.height, durationMs: row.duration * 1000 },
  }
}

export async function publishedHomeReels(): Promise<PublishedProject[]> {
  const { data } = await publicClient()?.from('published_portfolio_media').select(columns)
    .eq('project_format', 'reel').eq('featured', true).in('placement', ['home', 'both'])
    .order('display_order').order('published_at', { ascending: false }).order('id').limit(6) ?? {}
  return (data ?? []).map(project)
}

export async function publishedWork({ format, tagSlugs, sort, cursor, limit = 12 }: WorkQuery): Promise<WorkPage> {
  const offset = cursor && /^\d{1,6}$/.test(cursor) ? Number(cursor) : 0
  const count = Math.min(30, Math.max(1, limit))
  let query = publicClient()?.from('published_portfolio_media').select(columns)
    .eq('project_format', format).in('placement', ['work', 'both'])
  if (tagSlugs.length) query = query?.in('category', tagSlugs)
  if (sort === 'curated') query = query?.order('display_order')
  const { data } = await query?.order('published_at', { ascending: false }).order('id').range(offset, offset + count) ?? {}
  const rows = data ?? []
  return {
    releaseId: 'published', items: rows.slice(0, count).map(project),
    nextCursor: rows.length > count ? String(offset + count) : null,
  }
}
