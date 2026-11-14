import 'server-only'
import { cache } from 'react'
import { slugPattern, type PublicFeedback, type PublicProject, type Study } from '../domain/portfolio-cms'
import type { WorkQuery } from '../domain/portfolio'
import { createPublicSupabaseClient } from '../lib/supabase/public'

const projectFields = 'id,slug,title,description,presentation,poster_url,poster_small_url,media,lead'

export async function homePortfolioContent() {
  const supabase = createPublicSupabaseClient()
  const feedbackFields = 'id,client_name,affiliation,profile_url,quote,featured,avatar,proof,services,work_title,work_slug,work_poster,work_video'
  const feedbackQuery = (fields: string) => supabase?.from('portfolio_public_feedback').select(fields)
    .order('display_order').order('published_at', { ascending: false }).order('id')
  const [feedback, projects] = await Promise.all([
    feedbackQuery(feedbackFields + ',instagram_url,tiktok_url,linkedin_url,voice_duration'),
    supabase?.from('portfolio_public_projects').select(projectFields).eq('featured', true)
      .order('display_order').order('published_at', { ascending: false }).order('id').limit(6),
  ])
  const entries = feedback?.error?.code === '42703' ? await feedbackQuery(feedbackFields) : feedback
  return { feedback: (entries?.data ?? []) as unknown as PublicFeedback[], projects: (projects?.data ?? []) as PublicProject[] }
}

export async function portfolioWork({ format, tagSlugs, sort, cursor, limit = 12 }: WorkQuery) {
  const offset = cursor && /^\d{1,6}$/.test(cursor) ? Number(cursor) : 0
  const count = Math.min(30, Math.max(1, limit))
  let query = createPublicSupabaseClient()?.from('portfolio_public_work').select(projectFields).eq('project_format', format)
  if (tagSlugs.length) query = query?.in('category', tagSlugs)
  if (sort === 'curated') query = query?.order('display_order')
  const result = await query?.order('published_at', { ascending: false }).order('id').range(offset, offset + count)
  if (!result || result.error?.code === 'PGRST205' || result.error?.code === '42P01') return null
  const rows = (result.data ?? []) as PublicProject[]
  return { projects: rows.slice(0, count), nextCursor: rows.length > count ? String(offset + count) : null }
}

export const publicCaseStudy = cache(async (slug: string) => {
  if (slug.length > 80 || !slugPattern.test(slug)) return null
  const result = await createPublicSupabaseClient()?.from('portfolio_public_case_studies')
    .select(projectFields + ',overview,requirements,role,approach,process,outcome').eq('slug', slug).maybeSingle()
  return (result?.data ?? null) as (PublicProject & Study) | null
})

export async function publishedCaseStudySlugs() {
  const supabase = createPublicSupabaseClient()
  if (!supabase) return []
  const slugs: string[] = []
  const size = 500
  for (let start = 0; ; start += size) {
    const { data, error } = await supabase.from('portfolio_public_case_studies').select('slug').order('slug').range(start, start + size - 1)
    if (error || !data) return slugs
    for (const { slug } of data) if (typeof slug === 'string' && slug.length <= 80 && slugPattern.test(slug)) slugs.push(slug)
    if (data.length < size) return slugs
  }
}
