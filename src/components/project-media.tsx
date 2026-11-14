import { publicPlayerItem, type PublicAsset } from '../domain/portfolio-cms'
import { InlineVideo } from './inline-video'

export function ProjectMedia({ media }: { media: PublicAsset }) {
  return <div className="portfolio-media" style={{ aspectRatio: `${media.width} / ${media.height}` }}>
    {media.kind === 'video' ? <InlineVideo item={publicPlayerItem(media)} /> :
      <img src={media.url} alt={media.title} loading="lazy" decoding="async" width={media.width} height={media.height} />}
  </div>
}
