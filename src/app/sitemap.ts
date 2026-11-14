import type { MetadataRoute } from 'next'
import { publishedCaseStudySlugs } from '../server/portfolio-cms'
import { productionSite } from '../server/site-metadata'

export const dynamic = 'force-dynamic'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = productionSite()
  if (!site) return []
  const slugs = await publishedCaseStudySlugs()
  return ['/', '/work', ...slugs.map((slug) => `/work/${slug}`)].map((path) => ({ url: new URL(path, site).href }))
}
