import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { after, before, test } from 'node:test'
import { chromium, firefox, webkit } from 'playwright-core'
import { root, startBuiltServer } from './server.mjs'

let server
before(async () => { server = await startBuiltServer({ review: true }) })
after(async () => { await server?.stop() })

for (const [engine, type, options] of [['Chromium (Edge)', chromium, { channel: 'msedge' }], ['Firefox', firefox, {}], ['WebKit', webkit, {}]]) {
  test(`${engine}: actual Contact star at five frames, seam, contrast and mobile still`, async (t) => {
    const browser = await type.launch(options)
    t.after(() => browser.close())
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
    page.setDefaultTimeout(7000)
    await page.goto(server.origin + '/#contact')
    await page.locator('.contact-panel').scrollIntoViewIfNeeded()
    await page.evaluate(() => document.fonts.ready)
    await page.waitForFunction(() => {
      const video = document.querySelector('.contact-star video')
      return video?.readyState >= 2 && video.classList.contains('is-playing')
    }, null, { timeout: 7000 })
    assert.equal(await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Contact' }).getAttribute('aria-current'), 'location')
    const video = page.locator('.contact-star video')
    const asset = await page.request.get(server.origin + '/api/review/contact-star')
    const original = await readFile(new URL('../handoff/assets/media/contact_star_motion_REFERENCE.mp4', root))
    const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
    assert.equal(hash(await asset.body()), hash(original))
    const { width, height, duration } = await video.evaluate((node) => {
      const dimensions = { width: node.videoWidth, height: node.videoHeight, duration: node.duration }
      node.pause()
      return dimensions
    })
    assert.ok(width > 0 && width === height, `Expected square media, reported ${width}×${height}`)
    assert.ok(duration > 4.8 && duration < 5.1)
    const zone = page.locator('.contact-star-zone')
    const intro = page.locator('.contact-intro-content')
    const panel = await page.locator('.contact-intro').boundingBox()
    const star = await page.locator('.contact-star').boundingBox()
    const form = await page.locator('.contact-form').boundingBox()
    assert.ok(Math.abs(star.x - panel.x - 16) <= 2 && Math.abs(star.y - panel.y - 100) <= 2)
    assert.ok(star.x + star.width < form.x)
    assert.equal(await zone.evaluate((node) => getComputedStyle(node).pointerEvents), 'none')

    await intro.evaluate((node) => { node.style.visibility = 'hidden' })
    await video.evaluate((node) => { node.parentElement.style.visibility = 'hidden' })
    const baseline = (await zone.screenshot()).toString('base64')
    await video.evaluate((node) => { node.parentElement.style.visibility = '' })
    const seenFrames = new Set()
    let minContrast = Infinity
    for (const proportion of [0, .25, .5, .75, .98]) {
      await video.evaluate(async (node, ratio) => {
        const target = Math.min(node.duration - .05, node.duration * ratio)
        if (Math.abs(node.currentTime - target) > .01) {
          const seeked = new Promise((resolve) => node.addEventListener('seeked', resolve, { once: true }))
          node.currentTime = target
          await seeked
        }
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      }, proportion)
      const frame = (await zone.screenshot()).toString('base64')
      seenFrames.add(frame)
      const metrics = await page.evaluate(async ([before, after]) => {
        async function pixels(bytes) {
          const image = new Image()
          image.src = 'data:image/png;base64,' + bytes
          await image.decode()
          const canvas = document.createElement('canvas')
          canvas.width = image.width; canvas.height = image.height
          const ctx = canvas.getContext('2d')
          ctx.drawImage(image, 0, 0)
          return ctx.getImageData(0, 0, canvas.width, canvas.height)
        }
        function luma(rgb) {
          return rgb.map((component) => component / 255)
            .map((component) => component <= .04045 ? component / 12.92 : ((component + .055) / 1.055) ** 2.4)
            .reduce((value, component, index) => value + component * [.2126, .7152, .0722][index], 0)
        }
        const [original, composite] = await Promise.all([pixels(before), pixels(after)])
        let darkestEdge = 0
        let brightest = 0
        let changed = 0
        for (let y = 0; y < original.height; y++) {
          for (let x = 0; x < original.width; x++) {
            const i = (y * original.width + x) * 4
            const old = [...original.data.subarray(i, i + 3)]
            const current = [...composite.data.subarray(i, i + 3)]
            if (x < 3 || y < 3 || x >= original.width - 3 || y >= original.height - 3) {
              darkestEdge = Math.max(darkestEdge, ...old.map((channel, j) => channel - current[j]))
            }
            if (Math.max(...old.map((channel, j) => Math.abs(channel - current[j]))) > 7) changed++
            brightest = Math.max(brightest, luma(current))
          }
        }
        return { darkestEdge, changed, contrast: (luma([194, 186, 207]) + .05) / (brightest + .05) }
      }, [baseline, frame])
      assert.ok(metrics.darkestEdge < 5, `Dark seam at frame ${proportion}: ${metrics.darkestEdge}`)
      assert.ok(metrics.changed > 100, `Star missing at frame ${proportion}`)
      minContrast = Math.min(minContrast, metrics.contrast)
    }
    assert.ok(seenFrames.size >= 4, 'Expected different decoded video frames')
    assert.ok(minContrast >= 4.5, `Minimum contrast ${minContrast.toFixed(2)}:1`)
    t.diagnostic(`${browser.version()} · minimum contrast ${minContrast.toFixed(2)}:1`)

    const compact = await browser.newPage({ viewport: { width: 390, height: 844 } })
    await compact.goto(server.origin + '/#contact')
    await compact.locator('.contact-panel').scrollIntoViewIfNeeded()
    await compact.locator('.contact-star img').evaluate((image) => image.decode())
    assert.equal(await compact.locator('.contact-star video').count(), 0)
    assert.ok(await compact.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  })
}
