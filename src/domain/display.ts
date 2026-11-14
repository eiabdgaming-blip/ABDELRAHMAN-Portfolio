import type { PublishedMedia, PublishedProject } from './portfolio'

export interface PlayerItem {
  id: string
  title: string
  locale: 'en' | 'ar'
  poster: string
  smallPoster?: string
  src: string
  width: number
  height: number
  duration: number
}

export const reviewMedia = (id: string) => '/api/review/' + encodeURIComponent(id)

export function playerItem(title: string, poster: string, media: PublishedMedia<'video'>, locale: 'en' | 'ar' = 'en'): PlayerItem {
  return {
    id: media.id, title, locale, poster: reviewMedia(poster), src: media.url ?? reviewMedia(media.id),
    width: media.width ?? 16, height: media.height ?? 9, duration: (media.durationMs ?? 0) / 1000,
  }
}

export function projectPlayerItem(project: PublishedProject): PlayerItem {
  const item = playerItem(project.title.value, project.poster.id, project.leadPlayback, project.title.locale)
  return { ...item, poster: project.poster.url ?? item.poster, smallPoster: project.poster.smallUrl }
}
