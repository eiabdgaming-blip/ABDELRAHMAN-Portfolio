import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { after, before, test } from 'node:test'
import { chromium } from 'playwright-core'
import { startBuiltServer, root } from './server.mjs'

let browser, server
before(async () => {
  server = await startBuiltServer({ review: true, env: { NEXT_PUBLIC_SUPABASE_URL: '', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '' } })
  browser = await chromium.launch({ channel: 'msedge' })
})
after(async () => {
  await browser?.close()
  await server?.stop()
})

async function pageFor(t, options) {
  const page = await browser.newPage(options)
  page.setDefaultTimeout(8000)
  t.after(() => page.close())
  return page
}

function near(actual, expected, tolerance = 2) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `Expected ${actual} within ${tolerance} of ${expected}`)
}

async function noOverflow(page) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
}

const url = (path = '/') => server.origin + path
const group = (page) => page.getByRole('navigation', { name: 'Primary', exact: true })
const lens = (page) => page.locator('.nav-lens')
const modal = (page) => page.getByRole('dialog')

async function lensAt(page, id) {
  await page.waitForFunction((destination) => {
    const lens = document.querySelector('.nav-lens').getBoundingClientRect()
    const label = document.querySelector(`[data-destination="${destination}"]`).getBoundingClientRect()
    return Math.abs(lens.left - label.left) <= 1.5 && Math.abs(lens.top - label.top) <= 1.5 &&
      Math.abs(lens.width - label.width) <= 1 && lens.width > 0
  }, id)
}

test('responsive Home and Work match the required order, viewport geometry and reel count', async (t) => {
  for (const [width, height] of [[1440, 900], [1024, 800], [768, 800], [720, 450], [390, 844], [320, 480]]) {
    await t.test(`${width} × ${height}`, async (t) => {
      const page = await pageFor(t, { viewport: { width, height }, reducedMotion: 'reduce' })
      const errors = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(url(), { waitUntil: 'domcontentloaded' })
      await page.evaluate(() => document.fonts.ready)
      await noOverflow(page)
      assert.deepEqual(await page.locator('main section > h1, main section h2').allTextContents(),
        ['REELS', 'THE TIMELINE', 'SERVICES', 'CLIENT FEEDBACK', 'INSIDE THE EDIT', 'FAQ', "LET'S WORK TOGETHER"])
      assert.equal(await page.locator('main h1').textContent(), 'ABDELRAHMAN')
      const headings = await page.locator('main section h2').evaluateAll((nodes) => nodes.map((node) => {
        const style = getComputedStyle(node)
        return style.fontFamily.includes('Archivo Black') && style.backgroundImage.includes('linear-gradient')
      }))
      assert.ok(headings.every(Boolean))
      if (width <= 390) {
        const timeline = page.getByRole('region', { name: 'Timeline tracks' })
        assert.ok(await timeline.evaluate((node) => {
          node.scrollLeft = 60
          const scrolls = node.scrollLeft > 0
          node.scrollLeft = 0
          return scrolls
        }))
      }
      const headingFits = await page.locator('.hero-type h1').evaluate((heading) => {
        const range = document.createRange()
        range.selectNodeContents(heading)
        return range.getBoundingClientRect().right <= heading.parentElement.getBoundingClientRect().right + 1
      })
      assert.equal(headingFits, true)
      assert.equal(await page.locator('.nav-lens').count(), 1)
      await lens(page).waitFor({ state: width > 767 ? 'visible' : 'hidden' })
      assert.equal(await page.locator('.nav-brand .brand-ink').evaluate((element) => getComputedStyle(element).color), 'rgb(244, 243, 248)')
      assert.ok(await page.locator('.nav-brand .brand-ink').evaluate((element) => getComputedStyle(element, '::after').filter.includes('blur')))
      const explore = page.getByRole('link', { name: 'Scroll to explore' })
      await explore.focus()
      assert.equal(await explore.evaluate((link) => getComputedStyle(link).outlineStyle), 'solid')
      await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }))

      const [header, poster, left, right, primary] = await Promise.all(
        ['.site-nav', '.hero-poster', '.hero-left', '.hero-right', '.hero-star'].map((selector) => page.locator(selector).boundingBox()),
      )
      near(header.y, 16, 1)
      near(poster.width / poster.height, 16 / 9, .02)
      if (width === 1440 || width === 390) {
        const boxes = width === 1440
          ? [[72, 16, 1296, 56], [72, 373, 816, 459], [0, 75, 78, 78], [1344, 267, 96, 96], [920, 365, 430, 350]]
          : [[20, 16, 350, 52], [20, 300, 350, 197], [0, 78, 62, 62], [334, 563, 56, 56], [210, 79, 155, 128]]
        ;[header, poster, left, right, primary].forEach(({ x, y, width, height }, i) =>
          [x, y, width, height].forEach((value, n) => near(value, boxes[i][n], 2)))
      }
      if (width === 320) {
        near(left.width, 48)
        near(right.width, 42)
      }
      const menu = page.locator('.nav-disclosure summary')
      if (width <= 767) await menu.click()
      assert.deepEqual(await group(page).getByRole('link').evaluateAll((links) => links.map((link) => link.getAttribute('href'))),
        ['/#hero', '/work', '/#reels', '/#services', '/#feedback', '/#faq', '/#contact'])
      const placement = await group(page).evaluate((nav) => {
        const links = [...nav.querySelectorAll('a')].map((link) => link.getBoundingClientRect())
        const brand = document.querySelector('.nav-brand').getBoundingClientRect()
        return links.every((box, i) => box.left >= 0 && box.right <= innerWidth &&
          (i === 0 || links[i - 1].right <= box.left || links[i - 1].bottom <= box.top)) &&
          (links[0].left >= brand.right || links[0].top >= brand.bottom)
      })
      assert.equal(placement, true)
      await noOverflow(page)
      if (width <= 767) await menu.click()
      const rail = page.getByRole('region', { name: 'Featured reels' })
      await page.waitForFunction((compact) => document.querySelectorAll('.home-rail .reel-cover[inert]').length === (compact ? 2 : 0), width <= 767)
      assert.equal(await rail.getByRole('button', { name: /^Play / }).count(), width > 767 ? 3 : 1)
      assert.equal(await rail.locator('.reel-cover').count(), 3)
      assert.equal(await rail.locator('.reel-cover').allTextContents().then((all) => all.join('')), '')
      assert.equal(await page.locator('.edit-track').count(), 6)
      assert.equal(await page.locator('.faq-row').count(), 7)
      assert.deepEqual(errors, [])
      await page.goto(url('/work?format=reels'))
      await page.evaluate(() => document.fonts.ready)
      await noOverflow(page)
      await page.waitForFunction((compact) => document.querySelectorAll('.reel-cover[inert]').length === (compact ? 2 : 0), width <= 767)
      assert.equal(await page.getByRole('region', { name: 'Work reels' }).getByRole('button', { name: /^Play / }).count(), width > 767 ? 3 : 1)
    })
  }
})

test('one moving lens clips the purple paint, prioritizes focus and commits route and hash', async (t) => {
  const page = await pageFor(t, { viewport: { width: 1440, height: 900 } })
  await page.goto(url())
  await lensAt(page, 'home')
  await page.getByRole('link', { name: 'Work', exact: true }).hover()
  await page.waitForFunction(() => {
    const rect = (selector) => document.querySelector(selector).getBoundingClientRect()
    const current = rect('.nav-lens').left
    return current > rect('[data-destination="home"]').left + 5 && current < rect('[data-destination="work"]').left - 5
  })
  assert.match(await page.locator('.nav-color').evaluate((node) => getComputedStyle(node).clipPath), /^inset/)
  await lensAt(page, 'work')
  assert.equal(await group(page).getByRole('link', { name: 'Home' }).getAttribute('aria-current'), 'location')
  await page.mouse.move(720, 120)
  await lensAt(page, 'home')

  await page.keyboard.press('Tab')
  await group(page).getByRole('link', { name: 'Home' }).focus()
  await page.keyboard.press('Tab')
  await lensAt(page, 'work')
  await group(page).getByRole('link', { name: 'Contact' }).hover()
  await lensAt(page, 'work')
  await group(page).getByRole('link', { name: 'Work' }).press('Enter')
  await page.waitForURL('**/work')
  await lensAt(page, 'work')
  await group(page).getByRole('link', { name: 'Contact' }).click()
  await page.waitForURL('**/#contact')
  await lensAt(page, 'contact')
  assert.equal(await group(page).getByRole('link', { name: 'Contact' }).getAttribute('aria-current'), 'location')
  await page.goBack()
  await lensAt(page, 'work')
  await page.goForward()
  await lensAt(page, 'contact')
})

test('compact touch disclosure, Escape and native no-script navigation work', async (t) => {
  const phone = await pageFor(t, { viewport: { width: 390, height: 844 }, hasTouch: true, reducedMotion: 'reduce' })
  await phone.goto(url())
  const menu = phone.getByText('Menu', { exact: false }).and(phone.locator('summary')).first()
  await menu.tap()
  await lensAt(phone, 'home')
  assert.equal(await phone.locator('.nav-lens:visible').count(), 1)
  await group(phone).getByRole('link', { name: 'Contact' }).focus()
  await phone.keyboard.press('Escape')
  assert.equal(await lens(phone).isVisible(), false)
  assert.equal(await menu.evaluate((node) => document.activeElement === node), true)
  await menu.tap()
  await group(phone).getByRole('link', { name: 'Contact' }).tap()
  await phone.waitForURL('**/#contact')
  assert.equal(await lens(phone).isVisible(), false)
  await menu.tap()
  await lensAt(phone, 'contact')
  const noJs = await pageFor(t, { javaScriptEnabled: false, viewport: { width: 390, height: 844 } })
  await noJs.goto(url())
  await noJs.locator('.nav-disclosure summary').click()
  assert.equal(await group(noJs).getByRole('link', { name: 'Home' }).getAttribute('aria-current'), 'location')
  await group(noJs).getByRole('link', { name: 'Work' }).click()
  await noJs.waitForURL('**/work')
  const desktop = await pageFor(t, { javaScriptEnabled: false, viewport: { width: 1440, height: 900 } })
  await desktop.goto(url())
  assert.equal(await group(desktop).getByRole('link', { name: 'Work' }).isVisible(), true)
})

test('section links land below the sticky header with smooth scrolling and track history', async (t) => {
  const page = await pageFor(t, { viewport: { width: 1440, height: 900 } })
  await page.goto(url())
  const nav = group(page)
  const destination = await page.locator('#services').evaluate((node) => node.getBoundingClientRect().top + scrollY)
  await nav.getByRole('link', { name: 'Services' }).click()
  await page.waitForURL('**/#services')
  assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior), 'smooth')
  await page.waitForFunction((end) => scrollY > 20 && scrollY < end - 220, destination)
  assert.equal(await page.locator('#services h2').evaluate((node) => getComputedStyle(node).animationName), 'section-reveal')

  async function arrived(id) {
    await page.waitForFunction((section) => {
      const top = document.getElementById(section).getBoundingClientRect().top
      return section === 'hero' ? scrollY < 2 : Math.abs(top - 84) < 3
    }, id)
    const active = id === 'hero' ? 'home' : id
    assert.equal(await nav.locator('[aria-current="location"]').getAttribute('data-destination'), active)
  }
  await arrived('services')
  for (const [name, id] of [['Client Feedback', 'feedback'], ['FAQ', 'faq'], ['Contact', 'contact'], ['Home', 'hero'], ['Reels', 'reels']]) {
    await nav.getByRole('link', { name, exact: true }).click()
    await page.waitForURL('**/#' + id)
    await arrived(id)
  }
  await page.evaluate(async () => {
    const scrolled = new Promise((resolve) => document.addEventListener('scrollend', resolve, { once: true }))
    document.getElementById('faq').scrollIntoView({ behavior: 'instant' })
    await scrolled
  })
  await page.waitForFunction(() => document.querySelector('[data-destination="faq"]').getAttribute('aria-current') === 'location')
  assert.equal(new URL(page.url()).hash, '#reels')
  await page.goBack()
  await arrived('hero')
  // Chromium restores the previous entry's position as the smooth scroll settles.
  await page.waitForFunction(() => scrollY === 0)
  await page.goForward()
  await page.waitForURL('**/#reels')
  await arrived('faq')
})

test('all section links from Work honor the header offset with Reduced Motion', async (t) => {
  const page = await pageFor(t, { viewport: { width: 390, height: 844 }, hasTouch: true, reducedMotion: 'reduce' })
  for (const [name, id] of [['Home', 'hero'], ['Reels', 'reels'], ['Services', 'services'], ['Client Feedback', 'feedback'], ['FAQ', 'faq'], ['Contact', 'contact']]) {
    await page.goto(url('/work'))
    const menu = page.locator('.nav-disclosure summary')
    await menu.tap()
    await group(page).getByRole('link', { name, exact: true }).tap()
    await page.waitForURL('**/#' + id)
    await page.waitForFunction((section) => {
      const node = document.getElementById(section)
      return node && (section === 'hero' ? scrollY < 2 : Math.abs(node.getBoundingClientRect().top - 80) < 3)
    }, id)
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior), 'auto')
    assert.equal(await page.locator('#' + id + ' h2').evaluateAll((headings) =>
      headings.every((heading) => getComputedStyle(heading).animationName === 'none')), true)
    assert.equal(await group(page).isVisible(), false)
    await noOverflow(page)
  }
})

test('public decorations match the originals, review reels support ranges, and ambient limits hold', async (t) => {
  const page = await pageFor(t, { viewport: { width: 1440, height: 900 } })
  const requested = []
  page.on('request', (request) => requested.push(request.url()))
  await page.goto(url())
  await page.waitForFunction(() => document.querySelector('video.is-playing') !== null)
  assert.ok(await page.locator('[data-ambient] video').count() <= 2)
  assert.ok(requested.includes(url('/videos/showreel.mp4')))
  await page.locator('.hero-left video.is-playing').waitFor()
  await page.evaluate(() => scrollTo(0, 160))
  await page.locator('.hero-right video.is-playing').waitFor()
  assert.equal(await page.locator('.hero-left video').count(), 0)
  assert.ok(await page.locator('[data-ambient] video').count() <= 2)
  for (const [key, file] of [['hero-left', 'hero_star_LEFT_as_submitted.mp4'], ['hero-right', 'hero_star_RIGHT_as_submitted.mp4']]) {
    const response = await page.request.get(url('/visuals/' + key + '.mp4'))
    assert.equal(response.status(), 200)
    const expected = await readFile(new URL('../handoff/assets/media/' + file, root))
    const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')
    assert.equal(sha(await response.body()), sha(expected))
  }
  const range = await page.request.get(url('/api/review/fashion'), { headers: { Range: 'bytes=100-199' } })
  assert.equal(range.status(), 206)
  assert.match(range.headers()['content-range'], /^bytes 100-199\//)
  assert.equal((await range.body()).length, 100)
  assert.equal((await page.request.get(url('/api/review/fashion'), { headers: { Range: 'bytes=99999999-' } })).status(), 416)
  assert.equal((await page.request.get(url('/api/review/fashion'), { headers: { 'sec-fetch-site': 'cross-site' } })).status(), 404)
  assert.equal((await page.request.get(url('/api/review/unknown'))).status(), 404)
  assert.equal((await page.request.get(url('/api/review/fashion'), { headers: { host: 'portfolio.example.test' } })).status(), 404)
  await page.evaluate(() => scrollTo(0, 0))
  const leftVideo = page.locator('.hero-left video.is-playing')
  await leftVideo.waitFor()
  assert.deepEqual(await leftVideo.evaluate((video) => [video.autoplay, video.loop, video.muted, video.playsInline, video.controls, video.tabIndex]),
    [true, true, true, true, false, -1])
  const firstTime = await leftVideo.evaluate((video) => video.currentTime)
  const star = page.locator('.hero-left')
  const firstFrame = await star.screenshot()
  await page.waitForFunction((time) => document.querySelector('.hero-left video').currentTime > time + .35, firstTime)
  const secondFrame = await star.screenshot()
  assert.notDeepEqual(secondFrame, firstFrame, 'Composited star pixels should change during playback')
  assert.equal(await star.locator('button').count(), 0)
  await leftVideo.evaluate((video) => { video.currentTime = video.duration - .15 })
  await page.waitForFunction(() => {
    const video = document.querySelector('.hero-left video')
    return video && !video.paused && !video.seeking && video.currentTime < .5
  })
  await page.locator('.about').scrollIntoViewIfNeeded()
  await page.locator('.about-disk video.is-playing').waitFor()
  const reduced = await pageFor(t, { reducedMotion: 'reduce' })
  await reduced.goto(url())
  await reduced.locator('.contact-panel').scrollIntoViewIfNeeded()
  assert.equal(await reduced.locator('[data-ambient] video').count(), 0)
  assert.equal(await reduced.locator('.marquee-track').evaluate((node) => getComputedStyle(node).animationName), 'none')
  const constrained = await pageFor(t, { viewport: { width: 390, height: 844 } })
  await constrained.addInitScript(() => Object.defineProperty(navigator.connection, 'saveData', { value: true }))
  await constrained.goto(url())
  await constrained.locator('.contact-panel').scrollIntoViewIfNeeded()
  assert.equal(await constrained.locator('[data-ambient] video').count(), 0)
})

test('production Home and Work render without broken images or review requests', async (t) => {
  const production = await startBuiltServer({ env: { NEXT_PUBLIC_SUPABASE_URL: '', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '' } })
  t.after(production.stop)
  for (const [width, height] of [[1440, 900], [1024, 768], [768, 900], [390, 844]]) {
    const page = await pageFor(t, { viewport: { width, height }, reducedMotion: 'reduce' })
    const reviewRequests = []
    page.on('request', (request) => { if (new URL(request.url()).pathname.startsWith('/api/review/')) reviewRequests.push(request.url()) })
    await page.goto(production.origin)
    for (const section of ['#hero', '#reels', '.timeline-section', '#services', '#feedback', '#faq', '#contact']) {
      await page.locator(section).scrollIntoViewIfNeeded()
      await noOverflow(page)
    }
    const visuals = page.locator('img[src^="/visuals/"]')
    assert.equal(await visuals.count(), 8)
    for (const image of await visuals.all()) {
      assert.ok(await image.evaluate(async (node) => {
        node.loading = 'eager'
        await node.decode()
        return node.naturalWidth > 0
      }))
    }
    await page.locator('.hero-poster').scrollIntoViewIfNeeded()
    await page.waitForFunction(() => document.querySelector('.hero-poster video')?.currentTime > 0.15)
    assert.equal(await page.locator('[data-ambient] video').count(), 0)
    await noOverflow(page)
    await page.goto(production.origin + '/work')
    await page.getByRole('heading', { name: 'WORK', exact: true }).waitFor()
    await noOverflow(page)
    await page.keyboard.press('Tab')
    assert.equal(await page.evaluate(() => document.activeElement?.className), 'skip-link')
    await page.keyboard.press('Enter')
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'main')
    await page.goto(production.origin + '/admin/login')
    await noOverflow(page)
    await page.keyboard.press('Tab')
    await page.keyboard.press('Enter')
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'main')
    assert.deepEqual(reviewRequests, [])
    await page.close()
  }
})

test('Hero autoplays muted, loops and resumes while reels stay click-to-play', async (t) => {
  for (const [width, height] of [[1440, 900], [390, 844], [320, 480]]) {
    await t.test(`${width} px`, async (t) => {
      const page = await pageFor(t, { viewport: { width, height }, reducedMotion: 'reduce', hasTouch: width < 768 })
      await page.goto(url())
      const hero = page.locator('.hero-poster')
      const video = hero.locator('video')
      await page.waitForFunction(() => document.querySelector('.hero-poster video').currentTime > .15)
      const initial = await hero.boundingBox()
      near(initial.width / initial.height, 16 / 9, .02)
      assert.equal(await video.evaluate((node) => node.videoWidth), 1920)
      assert.deepEqual(await video.evaluate((node) => [node.autoplay, node.muted, node.loop, node.playsInline, node.controls]),
        [true, true, true, true, false])
      assert.equal(await hero.locator('button').count(), 0)
      assert.equal(await page.getByRole('button', { name: 'Watch showreel' }).count(), 0)
      assert.equal(await modal(page).count(), 0)
      await video.evaluate(async (node) => {
        const sought = new Promise((resolve) => node.addEventListener('seeked', resolve, { once: true }))
        node.currentTime = node.duration - .4
        await sought
      })
      await page.waitForFunction(() => {
        const node = document.querySelector('.hero-poster video')
        return !node.paused && node.currentTime < 1.5
      })

      if (width === 1440) {
        await page.evaluate(() => {
          Object.defineProperty(document, 'hidden', { configurable: true, value: true })
          document.dispatchEvent(new Event('visibilitychange'))
        })
        assert.equal(await video.evaluate((node) => node.paused), true)
        await page.evaluate(() => {
          Reflect.deleteProperty(document, 'hidden')
          document.dispatchEvent(new Event('visibilitychange'))
        })
        await page.waitForFunction(() => !document.querySelector('.hero-poster video').paused)
      }

      await page.locator('.contact-panel').scrollIntoViewIfNeeded()
      await page.waitForFunction(() => document.querySelector('.hero-poster video').paused)
      await page.evaluate(() => scrollTo(0, 0))
      await page.waitForFunction(() => !document.querySelector('.hero-poster video').paused)

      const rail = page.getByRole('region', { name: 'Featured reels' })
      const card = rail.locator('.reel-cover[data-slot="active"]')
      const activate = card.getByRole('button', { name: 'Play Fashion reel' })
      await activate.scrollIntoViewIfNeeded()
      const before = await card.boundingBox()
      const reel = card.locator('video')
      assert.equal(await reel.getAttribute('src'), null)
      if (width < 768) await activate.tap()
      else await activate.click()
      await card.getByRole('button', { name: 'Pause Fashion reel' }).waitFor()
      near(before.width / before.height, 9 / 16, .025)
      assert.deepEqual(await card.boundingBox(), before)
      assert.equal(await reel.evaluate((node) => getComputedStyle(node).objectFit), 'contain')
      assert.equal(await video.evaluate((node) => node.muted), true)
      assert.equal(await modal(page).count(), 0)
      await card.getByRole('button', { name: 'Mute Fashion reel' }).click()
      assert.equal(await reel.evaluate((node) => node.muted), true)
      await card.getByRole('button', { name: 'Pause Fashion reel' }).click()
      assert.equal(await reel.evaluate((node) => node.paused), true)
      await card.getByRole('button', { name: 'Play Fashion reel' }).click()
      await card.getByRole('button', { name: 'Pause Fashion reel' }).waitFor()

      if (width >= 768) {
        await rail.getByRole('button', { name: 'Play Perfume reel' }).click()
        await rail.getByRole('button', { name: 'Pause Perfume reel' }).waitFor()
        assert.equal(await rail.getByRole('button', { name: 'Play Fashion reel' }).locator('..').locator('video').getAttribute('src'), null)
      }
      await rail.getByRole('button', { name: 'Next reel' }).click()
      assert.equal(await rail.locator('video[src]').count(), 0)
      await card.getByRole('button', { name: 'Play Perfume reel' }).click()
      await card.getByRole('button', { name: 'Pause Perfume reel' }).waitFor()
      await page.locator('.contact-panel').scrollIntoViewIfNeeded()
      await page.waitForFunction(() => !document.querySelector('.home-rail video[src]'))
      assert.equal(await modal(page).count(), 0)

      await page.goto(url('/work?format=reels'))
      const work = page.getByRole('region', { name: 'Work reels' })
      if (width === 1440) {
        const fashionSource = '**/api/review/fashion'
        const failPlayback = (route) => route.abort()
        await page.route(fashionSource, failPlayback)
        await work.getByRole('button', { name: 'Play Fashion reel' }).click()
        await work.getByRole('alert').waitFor()
        assert.match(await work.getByRole('alert').textContent(), /Video unavailable/)
        await page.unroute(fashionSource, failPlayback)
      }
      await work.getByRole('button', { name: 'Play Fashion reel' }).click()
      await work.getByRole('button', { name: 'Pause Fashion reel' }).waitFor()
      assert.equal(await work.locator('video[src]').count(), 1)
      assert.equal(await modal(page).count(), 0)
    })
  }
})


test('Work formats, multiple URL filters and sorting stay independent', async (t) => {
  const page = await pageFor(t, { reducedMotion: 'reduce' })
  await page.goto(url('/work?format=reels'))
  await page.getByText('Categories', { exact: false }).and(page.locator('summary')).click()
  await page.getByLabel('Beauty', { exact: true }).check()
  await page.getByLabel('Fashion', { exact: true }).check()
  await page.getByRole('button', { name: 'Apply filters' }).click()
  await page.waitForURL('**/work?format=reels&category=beauty&category=fashion&sort=curated')
  assert.equal(await page.locator('.reel-cover').count(), 2)
  await page.getByLabel('Sort work').selectOption('newest')
  await page.waitForURL('**/work?format=reels&category=beauty&category=fashion&sort=newest')
  assert.equal(await page.locator('.reel-cover[data-slot="active"] .inline-toggle').getAttribute('aria-label'), 'Play Fashion reel')
  await page.getByRole('link', { name: 'Long-form & YouTube' }).click()
  await page.waitForURL('**/work?format=long-form')
  assert.equal(await page.getByRole('status').textContent(), 'No long-form projects are available yet.')
  await page.goBack()
  assert.equal(new URL(page.url()).searchParams.get('sort'), 'newest')
})

test('Timeline play and scrub, seamless marquee, proof dialog and FAQ', async (t) => {
  const page = await pageFor(t)
  await page.goto(url())
  const time = page.getByTestId('timeline-timecode')
  const initial = await time.textContent()
  await page.getByRole('button', { name: 'Play sequence' }).click()
  await page.waitForFunction((before) => document.querySelector('[data-testid="timeline-timecode"]').textContent !== before, initial)
  await page.getByRole('button', { name: 'Pause sequence' }).click()
  const scrub = page.getByRole('slider', { name: 'Scrub illustrative sequence' })
  await scrub.press('Home')
  assert.equal(await time.textContent(), '00:00:00:00')
  await scrub.press('ArrowRight')
  assert.equal(await time.textContent(), '00:00:00:01')
  await scrub.press('End')
  assert.equal(await time.textContent(), '00:00:24:00')
  assert.deepEqual(await page.locator('.track-label').allTextContents(),
    ['V3 · Titles', 'V2 · B-roll', 'V1 · Main', 'A1 · Dialog', 'A2 · SFX', 'A3 · Music'])
  assert.equal(await page.locator('.edit-clip[data-active="true"]').count(), 0)
  assert.equal(await page.locator('.edit-clip .clip-wave').count(), 7)
  const strip = page.locator('.marquee')
  await strip.scrollIntoViewIfNeeded()
  await strip.hover()
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.marquee-track')).animationPlayState === 'running')
  assert.equal(await strip.locator('button').evaluate((button) => getComputedStyle(button).clipPath), 'inset(50%)')
  const join = await strip.locator('.marquee-track').evaluate((node) => {
    const [first, second] = node.children
    const animation = node.getAnimations()[0]
    const duration = animation.effect.getComputedTiming().duration
    const previous = animation.currentTime
    animation.currentTime = 0
    const start = first.getBoundingClientRect().left
    animation.currentTime = duration - 1
    const end = second.getBoundingClientRect().left
    animation.currentTime = previous
    return { difference: Math.abs(start - end), sameTerms: first.textContent === second.textContent, hiddenCopy: second.getAttribute('aria-hidden') }
  })
  assert.ok(join.difference < 1, `Visible jump at the marquee seam: ${join.difference}px`)
  assert.equal(join.sameTerms, true)
  assert.equal(join.hiddenCopy, 'true')
  const pause = strip.getByRole('button', { name: 'Pause scrolling terms' })
  await pause.press('Enter')
  assert.equal(await strip.locator('.marquee-track').evaluate((node) => getComputedStyle(node).animationPlayState), 'paused')

  const zoom = page.getByRole('button', { name: 'Zoom WhatsApp proof placeholder' })
  await zoom.click()
  assert.match(await modal(page).textContent(), /No client content/)
  await modal(page).getByRole('button', { name: 'Close' }).click()
  await modal(page).waitFor({ state: 'hidden' })
  await page.waitForFunction(() => document.activeElement.getAttribute('aria-label') === 'Zoom WhatsApp proof placeholder')
  await page.getByText('Transcript', { exact: true }).click()
  assert.equal(await page.getByText('A short synthetic tone. No speech or client recording.').isVisible(), true)
  await page.getByRole('button', { name: 'Play audio sample' }).click()
  await page.getByRole('button', { name: 'Pause audio sample' }).waitFor()
  await page.getByRole('button', { name: 'Pause audio sample' }).click()
  await page.getByRole('button', { name: 'With review' }).click()
  assert.equal(await page.locator('.feedback-card').count(), 0)

  const faq = page.getByRole('button', { name: 'How do revisions work?' })
  await faq.press('Enter')
  assert.equal(await faq.getAttribute('aria-expanded'), 'true')
  assert.equal(await page.getByRole('button', { name: 'What timelines do you work to?' }).getAttribute('aria-expanded'), 'false')

})

test('public contact links and validated WhatsApp draft use the owner destinations', async (t) => {
  const page = await pageFor(t, { viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })
  await page.goto(url('/work?format=reels'))
  await page.getByRole('link', { name: 'Contact ↗' }).click()
  await page.waitForURL('**/#contact')
  for (const [name, href] of [
    ['Instagram', 'https://www.instagram.com/abdo_ve1/'],
    ['TikTok', 'https://www.tiktok.com/@abdo_ve_1'],
  ]) {
    await page.context().route(href, (route) => route.fulfill({ body: 'Destination verified' }))
    const links = page.getByRole('link', { name: new RegExp('^' + name) })
    assert.equal(await links.count(), 2)
    for (const link of await links.all()) {
      assert.equal(await link.getAttribute('href'), href)
      const [popup] = await Promise.all([page.waitForEvent('popup'), link.click()])
      await popup.waitForLoadState()
      assert.equal(popup.url(), href)
      await popup.close()
    }
  }
  assert.match(await page.getByRole('link', { name: 'Email', exact: true }).getAttribute('href'), /^mailto:eiabdgaming@gmail\.com(?:\?|$)/)
  const posts = []
  page.on('request', (request) => { if (request.method() === 'POST') posts.push(request.url()) })
  const form = page.locator('.contact-form')
  const submit = form.getByRole('button', { name: /Save inquiry/ })
  await submit.click()
  assert.equal(await form.locator('[name="name"]').evaluate((node) => node.validity.valueMissing), true)
  await form.locator('[name="name"]').fill('Local Test')
  await form.getByLabel('Project type').selectOption('reels')
  await form.getByLabel('Service').selectOption('video-editing')
  await form.getByLabel('Project brief').fill('أهلاً & an edit?\nSecond line.')
  await submit.click()
  assert.match(await form.getByRole('alert').textContent(), /valid email address or WhatsApp/)
  await form.locator('[name="email"]').fill('test@example.invalid')
  await form.getByLabel('WhatsApp phone').fill('123')
  await submit.click()
  assert.equal(await form.getByLabel('WhatsApp phone').evaluate((node) => node.validity.patternMismatch), true)
  await form.getByLabel('WhatsApp phone').fill('+12025550123')
  await form.getByLabel('Budget').fill('500 USD')
  await form.getByLabel('Deadline').fill('Next month')
  await page.route('**/api/contact', (route) => {
    const lead = route.request().postDataJSON()
    const text = ['Name: ' + lead.name, 'Project type: Reels & Shorts', 'Service: Video Editing', 'Project brief: ' + lead.brief,
      'Budget: ' + lead.budget, 'Deadline: ' + lead.deadline, 'Email: ' + lead.email, 'WhatsApp phone: ' + lead.whatsapp].join('\n')
    return route.fulfill({ json: { whatsapp: 'https://wa.me/201007372106?text=' + encodeURIComponent(text),
      email: 'mailto:eiabdgaming@gmail.com' } })
  })
  await page.route('https://wa.me/201007372106?**', (route) => route.fulfill({ body: 'WhatsApp draft test' }))
  await submit.click()
  await form.getByText(/Inquiry saved/).waitFor()
  const [handoff] = await Promise.all([page.waitForRequest('https://wa.me/201007372106?**'),
    form.getByRole('link', { name: /Continue on WhatsApp/ }).click()])
  const draft = new URL(handoff.url())
  assert.equal(handoff.method(), 'GET')
  assert.equal(draft.pathname, '/201007372106')
  assert.deepEqual([...draft.searchParams.keys()], ['text'])
  assert.match(draft.searchParams.get('text'), /Name: Local Test\nProject type: Reels & Shorts\nService: Video Editing\nProject brief: أهلاً & an edit\?\nSecond line\.\nBudget: 500 USD\nDeadline: Next month\nEmail: test@example\.invalid\nWhatsApp phone: \+12025550123/)
  assert.deepEqual(posts, [url('/api/contact')])
})

test('compact reel navigation responds to touch swipes and keyboard without starting a video', async (t) => {
  const page = await pageFor(t, { viewport: { width: 390, height: 844 }, hasTouch: true, reducedMotion: 'reduce' })
  await page.goto(url('/work?format=reels'))
  const rail = page.getByRole('region', { name: 'Work reels' })
  const cover = rail.getByRole('button', { name: 'Play Fashion reel' })
  await cover.scrollIntoViewIfNeeded()
  const box = await cover.boundingBox()
  const client = await page.context().newCDPSession(page)
  const y = box.y + box.height * .5
  const x = box.x + box.width * .7
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
  await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - 78, y }] })
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  const next = rail.getByRole('button', { name: 'Play Perfume reel' })
  await next.waitFor()
  assert.equal(await modal(page).count(), 0)
  await next.press('ArrowLeft')
  await page.waitForFunction(() => document.activeElement.getAttribute('aria-label') === 'Play Fashion reel')
})
