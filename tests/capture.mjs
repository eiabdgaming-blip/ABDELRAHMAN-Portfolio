import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import { startBuiltServer } from './server.mjs'

const destination = new URL('../../phase-02-correction-preview/', import.meta.url)
const output = (name) => fileURLToPath(new URL(name + '.png', destination))
const server = await startBuiltServer({ review: true, env: { NEXT_PUBLIC_SUPABASE_URL: '', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '' } })
let browser
try {
  browser = await chromium.launch({ channel: 'msedge' })
  await mkdir(destination, { recursive: true })
  for (const [width, height] of [[1440, 900], [390, 844], [320, 480]]) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 })
    await page.goto(server.origin)
    await page.evaluate(() => document.fonts.ready)
    if (width !== 320) {
      await page.waitForFunction(() => document.querySelector('.hero-poster video').currentTime > .65)
      await page.screenshot({ path: output(`hero-${width}`) })
    }
    if (width !== 320) {
      const timeline = page.locator('.timeline-section')
      await timeline.evaluate((node) => window.scrollTo(0, node.getBoundingClientRect().top + scrollY - 90))
      await page.locator('.marquee').waitFor()
      await page.screenshot({ path: output(`timeline-marquee-${width}`) })
    }
    if (width === 1440) {
      await page.goto(server.origin + '/#contact')
      await page.locator('.contact-panel').screenshot({ path: output('contact-1440') })
    }
    if (width === 1440) await page.setViewportSize({ width, height: 1050 })
    await page.goto(server.origin + '/work?format=reels')
    const reel = page.getByRole('button', { name: 'Play Fashion reel' })
    await reel.click()
    await page.waitForFunction(() => document.querySelector('.reel-cover[data-slot="active"] video').currentTime > .35)
    if (width === 320) {
      await page.locator('.reel-stage').screenshot({ path: output('reels-320') })
    } else {
      await page.screenshot({ path: output(`reels-${width}`) })
    }
    await page.close()
  }
  console.log('Captured eight local screenshots in', fileURLToPath(destination))
} finally {
  await browser?.close()
  await server.stop()
}
