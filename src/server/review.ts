import 'server-only'
import { headers } from 'next/headers'
import type { HomeContent, PortfolioRepository, PublishedProject, WorkQuery } from '../domain/portfolio'

export function reviewAllowed(host: string | null) {
  return process.env.NODE_ENV === 'development' && process.env.ABDEL_LOCAL_REVIEW === '1' &&
    /^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host ?? '')
}

export async function localReview() {
  return reviewAllowed((await headers()).get('host'))
}

export const reviewFiles = {
  lumera: 'review-reels/lumera.mp4',
  'lumera-poster': 'stills/qamar-5.jpg',
  fashion: 'review-reels/fashion.mp4',
  'fashion-poster': 'stills/fashion-0.jpg',
  perfume: 'review-reels/perfume.mp4',
  'perfume-poster': 'stills/perfume-2.jpg',
  travel: 'review-reels/travel.mp4',
  'travel-poster': 'stills/travel-6.jpg',
} as const

const reelFixtures = [
  ['lumera', 'Beauty reel', 'beauty', 540, 960, 27430],
  ['fashion', 'Fashion reel', 'fashion', 508, 904, 56370],
  ['perfume', 'Perfume reel', 'product', 540, 960, 81370],
  ['travel', 'Travel reel', 'travel', 508, 904, 51970],
] as const satisfies readonly (readonly [keyof typeof reviewFiles, string, string, number, number, number])[]

const projects: PublishedProject[] = reelFixtures.map(([id, title, tag, width, height, durationMs]) => ({
  id, slug: id, format: 'reel', title: { locale: 'en', value: title },
  tagSlugs: [tag], poster: { id: id + '-poster', kind: 'image' }, media: [],
  leadPlayback: { id, kind: 'video', width, height, durationMs },
}))

export function portfolioRepository(review: boolean): PortfolioRepository {
  const releaseId = review ? 'local-review' : 'unpublished'
  return {
    async getHome(): Promise<HomeContent> {
      return {
        releaseId, featuredReels: review ? projects : [], reviews: [],
        showreel: { id: 'showreel', kind: 'video', width: 1920, height: 1080, durationMs: 6600 },
      }
    },
    async listWork({ format, tagSlugs, sort, cursor, limit = 12 }: WorkQuery) {
      const matching = review ? projects.filter((project) =>
        project.format === format && (!tagSlugs.length || tagSlugs.some((tag) => project.tagSlugs.includes(tag))),
      ) : []
      if (sort === 'newest') matching.reverse()
      const start = Math.max(0, matching.findIndex((project) => project.id === cursor) + 1)
      const items = matching.slice(start, start + Math.min(30, Math.max(1, limit)))
      return { releaseId, items, nextCursor: start + items.length < matching.length ? items.at(-1)?.id ?? null : null }
    },
  }
}
