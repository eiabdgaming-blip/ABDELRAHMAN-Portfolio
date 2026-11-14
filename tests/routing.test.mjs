import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
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
