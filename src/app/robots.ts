import type { MetadataRoute } from 'next'
import { productionSite } from '../server/site-metadata'

export const dynamic = 'force-dynamic'

export default function robots(): MetadataRoute.Robots {
  const site = productionSite()
  return site ? {
    rules: { userAgent: '*', disallow: ['/admin', '/api/'] },
    sitemap: new URL('/sitemap.xml', site).href,
  } : { rules: { userAgent: '*', disallow: '/' } }
}
