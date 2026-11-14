import type { PlayerItem } from './display'

export const studyFields = {
  overview: 'Project overview', requirements: 'Client requirements', role: 'My role',
  approach: 'Creative and editing approach', process: 'Process and decisions', outcome: 'Final outcome',
} as const
export type Study = Record<keyof typeof studyFields, string>
export type PortfolioStatus = 'draft' | 'published' | 'hidden'
export type AssetOption = { id: string; title: string; status: PortfolioStatus; resource_type: 'image' | 'video' }
export type PublicAsset = {
  id: string; title: string; kind: 'image' | 'video'; url: string; poster?: string;
  small_poster?: string; width: number; height: number; duration: number | null;
}
export type PublicProject = {
  id: string; slug: string | null; title: string; description: string; presentation: 'player' | 'case-study';
  poster_url: string; poster_small_url: string; media: PublicAsset[]; lead: PublicAsset | null;
}
export type PublicFeedback = {
  id: string; client_name: string; affiliation: string; profile_url: string | null; quote: string;
  featured: boolean; avatar: string | null; proof: string | null; services: string[];
  work_title: string | null; work_slug: string | null; work_poster: string | null; work_video: PublicAsset | null;
  instagram_url?: string | null; tiktok_url?: string | null; linkedin_url?: string | null; voice_duration?: number | null;
}
export const uuidPattern = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/
export const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
export const profilePattern = /^https:\/\/(?:(?:www\.)?instagram\.com\/[A-Za-z0-9_.]+|(?:www\.)?tiktok\.com\/@[A-Za-z0-9_.]+|(?:www\.)?linkedin\.com\/in\/[A-Za-z0-9-]+)\/?$/
export const profileFields = { instagram_url: 'Instagram', tiktok_url: 'TikTok', linkedin_url: 'LinkedIn' } as const
export const profileKeys = Object.keys(profileFields) as (keyof typeof profileFields)[]

export function publicPlayerItem(asset: PublicAsset, title = asset.title, poster = asset.poster ?? ''): PlayerItem {
  return {
    id: asset.id, title, locale: /\p{Script=Arabic}/u.test(title) ? 'ar' : 'en', src: asset.url,
    poster, smallPoster: asset.small_poster, width: asset.width, height: asset.height, duration: asset.duration ?? 0,
  }
}
