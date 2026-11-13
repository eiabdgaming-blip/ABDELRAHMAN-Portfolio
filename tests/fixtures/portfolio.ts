import type { HomeContent, PublishedProject } from '../../src/domain/portfolio'

// Test-only data. The opaque IDs resolve to no real people or media.
export const localHome = {
  releaseId: 'local-fixture',
  featuredReels: [],
  reviews: [],
} as const satisfies HomeContent

export const localProject = {
  id: '00000000-0000-4000-8000-000000000001',
  slug: 'local-test-only',
  format: 'reel',
  title: { value: 'عنوان للاختبار فقط', locale: 'ar' },
  tagSlugs: [],
  poster: { id: '00000000-0000-4000-8000-000000000002', kind: 'image' },
  media: [],
  leadPlayback: {
    id: '00000000-0000-4000-8000-000000000003',
    kind: 'video',
    width: 1920,
    height: 1080,
  },
} as const satisfies PublishedProject
