import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { test } from 'node:test'
import { root, startBuiltServer } from './server.mjs'

test('built site serves Home and Work and withholds local review data by default', async (t) => {
  const { origin, stop } = await startBuiltServer({ env: { NEXT_PUBLIC_SUPABASE_URL: '', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '' } })
  t.after(stop)

  const request = (path) => fetch(new URL(path, origin), { signal: AbortSignal.timeout(10_000) })
  const home = await request('/')
  assert.equal(home.status, 200)
  const html = await home.text()
  assert.match(html, /<html lang="en" dir="ltr">/)
  assert.match(html, /<h1\b[^>]*>ABDELRAHMAN<\/h1>/)
  assert.match(html, /name="robots" content="noindex, nofollow"/)
  assert.match(html, /href="\/work"/)
  for (const section of ['hero', 'reels', 'services', 'feedback', 'faq', 'contact']) {
    assert.ok(html.includes(`href="/#${section}"`) && html.includes(`id="${section}"`), section)
  }
  assert.doesNotMatch(html, /api\/review\/|Review placeholder|Beauty reel|Synthetic audio sample/)
  for (const path of ['hero-left-poster.png', 'hero-right-poster.png', 'hero-star-poster.png', 'contact-star-poster.png',
    'about-disk-poster.png', 'glass-cube.png', 'glass-moon.png', 'glass-cursor.png']) {
    assert.ok(html.includes('/visuals/' + path), path)
    const response = await request('/visuals/' + path)
    assert.equal(response.status, 200, path)
    assert.equal(response.headers.get('content-type'), 'image/png', path)
    await response.body?.cancel()
  }
  for (const path of ['/videos/showreel.mp4', ...['hero-left', 'hero-right', 'hero-star', 'contact-star', 'about-disk'].map((id) => '/visuals/' + id + '.mp4')]) {
    const response = await fetch(new URL(path, origin), { headers: { Range: 'bytes=0-99' } })
    assert.equal(response.status, 206, path)
    assert.equal((await response.arrayBuffer()).byteLength, 100, path)
  }

  for (const query of ['', '?format=reels', '?format=long-form']) {
    const work = await request(`/work${query}`)
    assert.equal(work.status, 200)
    assert.match(await work.text(), /<h1\b[^>]*>WORK<\/h1>/)
  }

  for (const file of ['archivo-black.ttf', 'geist.ttf', 'geist-mono.ttf', 'Archivo-Black-OFL.txt', 'Geist-OFL.txt']) {
    const response = await request(`/fonts/${file}`)
    assert.equal(response.status, 200, file)
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), await readFile(new URL(`public/fonts/${file}`, root)))
  }
  for (const font of ['archivo-black', 'geist', 'geist-mono']) {
    const response = await request(`/fonts/${font}.woff2`)
    assert.equal(response.status, 200, font)
    assert.equal(response.headers.get('content-type'), 'font/woff2')
    assert.match(response.headers.get('cache-control'), /max-age=86400/)
    assert.equal(Buffer.from(await response.arrayBuffer()).subarray(0, 4).toString(), 'wOF2')
  }

  for (const path of [
    '/work/local-test-only', '/privacy', '/api/admin/preview',
    '/references/approved/ABDELRAHMAN-Home-1440.png', '/assets/media/DIGITAL%20MARKETING1.mp4', '/api/review/showreel', '/api/review/fashion',
  ]) {
    const response = await request(path)
    assert.equal(response.status, 404, path)
    await response.body?.cancel()
  }
  const admin = await fetch(new URL('/admin/projects', origin), { redirect: 'manual' })
  assert.equal(admin.status, 307)
  assert.match(admin.headers.get('location'), /\/admin\/login/)
})

test('production review stays disabled even when the development flag is set', async (t) => {
  const { origin, stop } = await startBuiltServer({ env: { ABDEL_LOCAL_REVIEW: '1', NEXT_PUBLIC_SUPABASE_URL: '', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '' } })
  t.after(stop)
  assert.equal((await fetch(origin + '/api/review/fashion')).status, 404)
  assert.doesNotMatch(await (await fetch(origin)).text(), /api\/review\/|Review placeholder|Beauty reel/)
})

test('search metadata stays private by default and indexes only canonical published routes when enabled', async (t) => {
  const site = 'https://portfolio.example.test'
  const posted = { slug: 'published-study', title: 'Published study', description: 'An editorial case study.', media: [], presentation: 'case-study' }
  let studyLookups = 0
  let published = true
  const provider = createServer((request, response) => {
    const url = new URL(request.url, 'http://localhost')
    const slug = url.searchParams.get('slug')
    const studies = url.pathname.endsWith('/portfolio_public_case_studies')
    if (studies && slug) studyLookups++
    const data = !studies ? [] : slug ? (published && slug === 'eq.' + posted.slug ? posted : null) : published ? [{ slug: posted.slug }] : []
    response.setHeader('Content-Type', 'application/json')
    response.end(JSON.stringify(data))
  })
  provider.listen(0, '127.0.0.1')
  await once(provider, 'listening')
  t.after(() => new Promise((resolve) => provider.close(resolve)))
  const env = { NEXT_PUBLIC_SITE_URL: site, NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${provider.address().port}`,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_seo_fixture' }
  const preview = await startBuiltServer({ env: { ...env, PORTFOLIO_INDEXING_ENABLED: '0' } })
  t.after(preview.stop)
  assert.match(await (await fetch(preview.origin + '/robots.txt')).text(), /Disallow: \/\s*$/)
  assert.doesNotMatch(await (await fetch(preview.origin + '/sitemap.xml')).text(), /<loc>/)
  const previewHome = await (await fetch(preview.origin)).text()
  assert.match(previewHome, /noindex, nofollow/)
  assert.doesNotMatch(previewHome, /rel="canonical"/)

  const production = await startBuiltServer({ env: { ...env, PORTFOLIO_INDEXING_ENABLED: '1' } })
  t.after(production.stop)
  const request = (path) => fetch(production.origin + path, { headers: { 'User-Agent': 'Twitterbot' } })
  for (const [path, canonical] of [['/', '/'], ['/work?format=long-form', '/work'], ['/work/published-study', '/work/published-study']]) {
    const response = await request(path)
    assert.equal(response.status, 200)
    const head = (await response.text()).split('</head>')[0]
    const expected = new URL(canonical, site).href
    const canonicalTag = head.match(/rel="canonical" href="([^"]+)"/)
    const ogUrl = head.match(/property="og:url" content="([^"]+)"/)
    assert.ok(canonicalTag && ogUrl, path)
    assert.equal(new URL(canonicalTag[1]).href, expected)
    assert.equal(new URL(ogUrl[1]).href, expected)
    assert.match(head, /name="twitter:card" content="summary_large_image"/)
    assert.match(head, /name="description" content="[^"<>]+"/)
    if (path.endsWith(posted.slug)) {
      assert.match(head, /<title>Published study \| ABDELRAHMAN<\/title>/)
      assert.match(head, /An editorial case study\./)
    }
  }
  assert.equal(studyLookups, 1, 'metadata and rendering share the case study read')
  const rules = await (await request('/robots.txt')).text()
  for (const value of ['Disallow: /admin', 'Disallow: /api/', `Sitemap: ${site}/sitemap.xml`]) assert.ok(rules.includes(value), value)
  const sitemap = await (await request('/sitemap.xml')).text()
  assert.deepEqual([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, url]) => url),
    ['/', '/work', '/work/published-study'].map((path) => site + path))
  assert.match((await request('/admin/login')).headers.get('x-robots-tag'), /noindex/)
  assert.match((await request('/api/review/showreel')).headers.get('x-robots-tag'), /noindex/)
  published = false
  const hidden = await request('/work/published-study')
  assert.equal(hidden.status, 404)
  assert.match(await hidden.text(), /noindex/)
  assert.doesNotMatch(await (await request('/sitemap.xml')).text(), /published-study/)
})
