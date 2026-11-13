import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { root, startBuiltServer } from './server.mjs'

test('built site serves Home and Work and withholds local review data by default', async (t) => {
  const { origin, stop } = await startBuiltServer()
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
  assert.doesNotMatch(html, /api\/review\/|Review placeholder|Featured reels/)

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
    '/work/local-test-only', '/privacy', '/admin/projects', '/api/admin/preview',
    '/references/approved/ABDELRAHMAN-Home-1440.png', '/assets/media/DIGITAL%20MARKETING1.mp4', '/api/review/showreel',
  ]) {
    const response = await request(path)
    assert.equal(response.status, 404, path)
    await response.body?.cancel()
  }
})
