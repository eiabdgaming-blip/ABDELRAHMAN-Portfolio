import type { LocalizedText } from './locale'

export type ProjectFormat = 'reel' | 'long-form'

export type MediaKind = 'image' | 'video' | 'audio' | 'captions'

export interface PublishedMedia<Kind extends MediaKind = MediaKind> {
  readonly id: string
  readonly kind: Kind
  readonly url?: string
  readonly smallUrl?: string
  readonly width?: number
  readonly height?: number
  readonly durationMs?: number
}

export interface PublishedProject {
  readonly id: string
  readonly slug: string
  readonly format: ProjectFormat
  readonly title: LocalizedText
  readonly description?: LocalizedText
  readonly tagSlugs: readonly string[]
  readonly poster: PublishedMedia<'image'>
  readonly media: readonly PublishedMedia[]
  readonly leadPlayback: PublishedMedia<'video'>
}

export type PublishedReviewProof =
  | { readonly kind: 'whatsapp'; readonly image: PublishedMedia<'image'> }
  | { readonly kind: 'voice'; readonly audio: PublishedMedia<'audio'>; readonly transcript: LocalizedText }
  | { readonly kind: 'post'; readonly url: string }

export interface PublishedReview {
  readonly id: string
  readonly displayName: string
  readonly text: LocalizedText
  readonly proofs: readonly PublishedReviewProof[]
}

export interface HomeContent {
  readonly releaseId: string
  readonly showreel?: PublishedMedia<'video'>
  readonly featuredReels: readonly PublishedProject[]
  readonly reviews: readonly PublishedReview[]
}

export interface WorkQuery {
  readonly format: ProjectFormat
  readonly tagSlugs: readonly string[]
  readonly sort: 'curated' | 'newest'
  readonly cursor?: string
  readonly limit?: number
}

export interface WorkPage {
  readonly releaseId: string
  readonly items: readonly PublishedProject[]
  readonly nextCursor: string | null
}

export interface PortfolioRepository {
  getHome(): Promise<HomeContent>
  listWork(query: WorkQuery): Promise<WorkPage>
}
