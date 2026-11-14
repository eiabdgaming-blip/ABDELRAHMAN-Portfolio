import 'server-only'
import type { Metadata } from 'next'

const brand = 'ABDELRAHMAN'
const defaultImage = '/videos/showreel-poster.png'
export const preventIndexing = { index: false, follow: false }

export function productionSite() {
  if (process.env.NODE_ENV !== 'production' || process.env.PORTFOLIO_INDEXING_ENABLED !== '1') return null
  try {
    const url = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? '')
    if (url.protocol === 'https:' && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash &&
      url.hostname.includes('.') && !/^(?:127\.|0\.|.*\.(?:localhost|local)$)/i.test(url.hostname)) return url
  } catch { /* An unset or malformed origin keeps the site in preview mode. */ }
  return null
}

export function publicMetadata(path: string, title: string, description: string, poster?: string): Metadata {
  const site = productionSite()
  const url = site ? new URL(path, site) : undefined
  const images = site ? [new URL(defaultImage, site)] : []
  if (poster) {
    try {
      const image = new URL(poster)
      if (image.protocol === 'https:' && image.hostname === 'res.cloudinary.com' && !image.username && !image.password &&
        /^\/[\w-]+\/(image|video)\/upload\//.test(image.pathname)) images.unshift(image)
    } catch { /* Use the Showreel poster when the project poster is absent. */ }
  }
  const socialTitle = path === '/' ? title : `${title} | ${brand}`
  return {
    title: path === '/' ? { absolute: title } : title,
    description,
    robots: site ? { index: true, follow: true } : preventIndexing,
    alternates: url ? { canonical: url } : undefined,
    openGraph: { type: 'website', siteName: brand, url, title: socialTitle, description, images },
    twitter: { card: images.length ? 'summary_large_image' : 'summary', title: socialTitle, description, images },
  }
}
