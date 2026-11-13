import type { PublishedMedia, PublishedProject } from './portfolio'

export interface PlayerItem {
  id: string
  title: string
  locale: 'en' | 'ar'
  poster: string
  src: string
  width: number
  height: number
  duration: number
}

export const reviewMedia = (id: string) => '/api/review/' + encodeURIComponent(id)

export function playerItem(title: string, poster: string, media: PublishedMedia<'video'>, locale: 'en' | 'ar' = 'en'): PlayerItem {
  return {
    id: media.id, title, locale, poster: reviewMedia(poster), src: reviewMedia(media.id),
    width: media.width ?? 16, height: media.height ?? 9, duration: (media.durationMs ?? 0) / 1000,
  }
}

export const projectPlayerItem = (project: PublishedProject) =>
  playerItem(project.title.value, project.poster.id, project.leadPlayback, project.title.locale)
