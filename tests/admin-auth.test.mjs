import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createHash } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { test } from 'node:test'
import { chromium } from 'playwright-core'
import { startBuiltServer } from './server.mjs'

const owner = { id: '9d9c9e8e-6960-4402-99bf-e9cb1869b12b', email: 'owner@example.test' }
const visitor = { id: 'c66e11b3-e230-49ab-bd12-5077a3121e8c', email: 'visitor@example.test' }
const password = 'fixture-password'
const publicKey = 'sb_publishable_local-test'
const writerKey = 'sb_secret_fixture'
const cloudKey = 'fixture-api-key'
const cloudSecret = 'fixture-cloudinary-secret'
const cloudApi = 'https://api.cloudinary.com/v1_1/fixture-media'
const digest = (fields) => createHash('sha256')
  .update(Object.keys(fields).sort().map((key) => key + '=' + fields[key]).join('&') + cloudSecret).digest('hex')

test('admin auth and authenticated media uploads against local provider stubs', async (t) => {
  const tokens = new Map()
  const refreshTokens = new Map()
  let serial = 0
  let membership = 'active'
  let logouts = 0
  let refreshes = 0
  const uploads = new Map()
  const drafts = new Map()
  let verificationMismatch = true
  let databaseUnavailable = true

  function session(user, expiresIn = 3600) {
    const now = Math.floor(Date.now() / 1000)
    const part = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
    const access_token = part({ alg: 'HS256', typ: 'JWT' }) + '.' +
      part({ sub: user.id, exp: now + expiresIn, iat: now, role: 'authenticated', jti: ++serial }) + '.Zml4dHVyZQ'
    const refresh_token = 'fixture-refresh-' + serial
    tokens.set(access_token, user)
    refreshTokens.set(refresh_token, user)
    return { access_token, refresh_token, expires_in: expiresIn, token_type: 'bearer', user }
  }

  const stub = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1')
    const token = req.headers.authorization?.replace(/^Bearer /, '')
    const user = tokens.get(token)
    const send = (status, value) => {
      res.writeHead(status, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(value))
    }
    if (url.pathname.startsWith('/v1_1/fixture-media/resources/')) {
      if (req.headers.authorization !== 'Basic ' + Buffer.from(cloudKey + ':' + cloudSecret).toString('base64')) return send(401, {})
      const asset = uploads.get(url.pathname.split('/').at(-1))
      if (!asset || !url.pathname.includes('/' + asset.resource_type + '/authenticated/')) return send(404, {})
      if (asset.resource_type === 'video' && url.searchParams.get('media_metadata') !== 'true') return send(400, {})
      return send(200, verificationMismatch ? { ...asset, type: 'upload' } : asset)
    }
    if (url.pathname === '/rest/v1/media_assets' && req.method === 'POST') {
      if (req.headers.apikey !== writerKey || membership !== 'active') return send(403, {})
      if (databaseUnavailable) return send(503, {})
      let raw = ''
      for await (const chunk of req) raw += chunk
      const draft = JSON.parse(raw)
      const asset = uploads.get(draft.cloudinary_public_id)
      if (!asset || draft.owner_id !== owner.id || draft.status !== 'draft' ||
        draft.delivery_type !== 'authenticated' || draft.cloudinary_asset_id !== asset.asset_id) return send(400, {})
      drafts.set(draft.id, { ...draft, created_at: new Date().toISOString() })
      return send(201, {})
    }
    if (req.headers.apikey !== publicKey) return send(401, {})
    if (url.pathname === '/rest/v1/media_assets') {
      if (user?.id !== owner.id || membership !== 'active') return send(403, {})
      const id = url.searchParams.get('id')?.slice(3)
      return send(200, id ? [...drafts.values()].filter((draft) => draft.id === id) : [...drafts.values()])
    }
    if (url.pathname === '/auth/v1/token') {
      let raw = ''
      for await (const chunk of req) raw += chunk
      const data = JSON.parse(raw)
      if (url.searchParams.get('grant_type') === 'refresh_token') {
        const refreshed = refreshTokens.get(data.refresh_token)
        if (!refreshed) return send(400, { error_code: 'refresh_token_not_found', msg: 'Expired' })
        refreshTokens.delete(data.refresh_token)
        refreshes++
        return send(200, session(refreshed))
      }
      const account = [owner, visitor].find((item) => item.email === data.email)
      if (!account || data.password !== password) return send(400, { error_code: 'invalid_credentials', msg: 'Private fixture error' })
      return send(200, session(account))
    }
    if (url.pathname === '/auth/v1/user') {
      return user ? send(200, user) : send(401, { error_code: 'bad_jwt', msg: 'Invalid session' })
    }
    if (url.pathname === '/rest/v1/owner_members' && req.method === 'GET') {
      if (!user) return send(401, { message: 'Authentication required' })
      if (membership === 'unavailable') return send(403, { message: 'Private fixture database error' })
      const matches = user.id === owner.id && membership === 'active' &&
        url.searchParams.get('auth_user_id') === 'eq.' + owner.id &&
        url.searchParams.get('role') === 'eq.owner' && url.searchParams.get('status') === 'eq.active'
      return send(200, matches ? [{ auth_user_id: owner.id }] : [])
    }
    if (url.pathname === '/auth/v1/logout' && user) {
      logouts++
      tokens.delete(token)
      res.writeHead(204).end()
      return
    }
    send(404, {})
  })
  stub.listen(0, '127.0.0.1')
  await once(stub, 'listening')
  t.after(() => new Promise((resolve) => stub.close(resolve)))

  const scratch = await mkdtemp(join(tmpdir(), 'abdel-media-test-'))
  t.after(() => rm(scratch, { recursive: true, force: true }))
  const preload = join(scratch, 'cloudinary.mjs')
  await writeFile(preload, `
    const original = globalThis.fetch
    globalThis.fetch = (input, init) => {
      const url = new URL(input instanceof Request ? input.url : input)
      if (url.origin === 'https://api.cloudinary.com' && url.pathname.startsWith('/v1_1/fixture-media/')) {
        return original(process.env.MEDIA_TEST_STUB + url.pathname + url.search, init)
      }
      return original(input, init)
    }
  `)
  const stubOrigin = 'http://127.0.0.1:' + stub.address().port
  const server = await startBuiltServer({ env: {
    NEXT_PUBLIC_SUPABASE_URL: stubOrigin,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publicKey,
    SUPABASE_MEDIA_SECRET_KEY: writerKey,
    CLOUDINARY_CLOUD_NAME: 'fixture-media',
    CLOUDINARY_API_KEY: cloudKey,
    CLOUDINARY_API_SECRET: cloudSecret,
    MEDIA_TEST_STUB: stubOrigin,
    NODE_OPTIONS: '--import=' + pathToFileURL(preload).href,
  } })
  t.after(server.stop)
  const browser = await chromium.launch({ channel: 'msedge' })
  t.after(() => browser.close())
  const page = await browser.newPage()
  page.setDefaultTimeout(6500)
  const admin = server.origin + '/admin'
  const login = admin + '/login'
  const media = admin + '/media'
  const cookieName = 'abdel-admin-session'
  const dashboard = page.getByRole('heading', { name: 'Admin dashboard' })
  async function submit(account, input = password) {
    await page.getByLabel('Email').fill(account.email)
    await page.getByLabel('Password').fill(input)
    await page.getByRole('button', { name: 'Sign in' }).click()
  }
  async function assertDenied(path) {
    await page.waitForURL(login + path)
    assert.equal(await dashboard.count(), 0)
  }
  const cookie = async () => (await page.context().cookies(admin)).find(({ name }) => name === cookieName)

  const response = await page.goto(admin)
  await assertDenied('')
  assert.match(response.headers()['cache-control'], /no-store/)
  assert.match(response.headers()['x-robots-tag'], /noindex/)
  assert.equal(await page.getByRole('link', { name: /sign up|register/i }).count(), 0)
  await page.goto(media)
  await assertDenied('')

  await submit(owner, 'wrong-password')
  await assertDenied('?error=credentials')
  assert.match(await page.locator('main').getByRole('alert').textContent(), /Check your email and password/)
  assert.equal(await cookie(), undefined)

  await submit(visitor)
  await assertDenied('?error=denied')
  assert.equal(await cookie(), undefined)

  membership = 'unavailable'
  await submit(owner)
  await assertDenied('?error=unavailable')
  assert.doesNotMatch(await page.locator('main').getByRole('alert').textContent(), /fixture/)
  assert.equal(await cookie(), undefined)

  membership = 'active'
  await submit(owner)
  await page.waitForURL(admin)
  await dashboard.waitFor()
  const authenticated = await cookie()
  assert.ok(authenticated.httpOnly)
  assert.equal(authenticated.path, '/admin')
  assert.equal(authenticated.sameSite, 'Lax')
  assert.doesNotMatch(await page.evaluate(() => document.cookie), /abdel-admin-session/)
  await page.reload()
  await dashboard.waitFor()

  await t.test('validates input, verifies provider metadata and retries the draft insert without re-uploading', async () => {
    await page.getByRole('link', { name: 'Media Library' }).click()
    await page.waitForURL(media)
    await page.getByRole('heading', { name: 'Media Library' }).waitFor()
    const file = page.getByLabel('File')
    const submitUpload = page.getByRole('button', { name: 'Upload draft' })
    const retry = page.getByRole('button', { name: 'Retry saving' })
    await page.getByLabel('Title').fill('Fixture video')
    await file.setInputFiles({ name: 'unsupported.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') })
    await submitUpload.click()
    await page.getByText('Choose a JPEG, PNG, WebP, MP4 or WebM file.').waitFor()
    assert.equal(uploads.size, 0)
    const bytes = Buffer.from('fixture video')
    await page.route(cloudApi + '/**', async (route) => {
      const cors = { 'access-control-allow-origin': server.origin, 'access-control-allow-methods': 'POST, OPTIONS' }
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
      const path = new URL(route.request().url()).pathname
      if (!path.endsWith('/upload')) return route.abort()
      const resource = path.split('/').at(-2)
      const body = route.request().postData()
      const field = (name) => body.match(new RegExp('name="' + name + '"\\r\\n\\r\\n([^\\r]+)'))?.[1]
      const signed = Object.fromEntries(['allowed_formats', 'overwrite', 'public_id', 'timestamp', 'type'].map((key) => [key, field(key)]))
      assert.match(signed.public_id, /^abdel-media-[\da-f-]+$/)
      assert.equal(signed.type, 'authenticated')
      assert.equal(signed.overwrite, 'false')
      assert.equal(field('api_key'), cloudKey)
      assert.equal(field('signature'), digest(signed))
      assert.ok(!body.includes(cloudSecret) && !body.includes(writerKey))
      const video = resource === 'video'
      uploads.set(signed.public_id, {
        public_id: signed.public_id, asset_id: (video ? 'a' : 'b').repeat(32), resource_type: resource,
        type: 'authenticated', bytes: bytes.length, format: signed.allowed_formats, width: 640, height: 360,
        media_metadata: video ? { duration: 2.5 } : {}, version: +signed.timestamp, created_at: new Date().toISOString(),
      })
      await page.getByRole('progressbar', { name: 'Upload progress' }).waitFor()
      return route.fulfill({ headers: cors, json: { asset_id: 'untrusted browser response' } })
    })
    await file.setInputFiles({ name: 'fixture.mp4', mimeType: 'video/mp4', buffer: bytes })
    await submitUpload.click()
    await page.getByText(/uploaded asset did not match/).waitFor()
    assert.equal(drafts.size, 0)
    verificationMismatch = false
    await retry.click()
    await page.getByText(/could not be saved/).waitFor()
    assert.equal(drafts.size, 0)
    databaseUnavailable = false
    await retry.click()
    await page.getByText('Media saved as Draft.').waitFor()
    await page.getByRole('heading', { name: 'Fixture video' }).waitFor()
    assert.equal(uploads.size, 1)
    assert.equal(drafts.size, 1)
    const [draft] = drafts.values()
    assert.equal(draft.duration, 2.5)
    assert.match(draft.secure_url, /\/video\/authenticated\//)
    const preview = media + '/preview/' + draft.id
    const access = await page.request.get(preview, { maxRedirects: 0 })
    assert.equal(access.status(), 307)
    assert.match(access.headers()['cache-control'], /no-store/)
    const signedPreview = new URL(access.headers().location)
    assert.equal(signedPreview.origin + signedPreview.pathname, cloudApi + '/video/download')
    const { signature, api_key, ...parameters } = Object.fromEntries(signedPreview.searchParams)
    assert.equal(api_key, cloudKey)
    assert.equal(signature, digest(parameters))
    assert.equal(parameters.type, 'authenticated')
    assert.equal(+parameters.expires_at - +parameters.timestamp, 600)
    const anonymous = await browser.newContext()
    try {
      const denied = await anonymous.request.get(preview, { maxRedirects: 0 })
      assert.equal(denied.status(), 307)
      assert.match(denied.headers().location, /\/admin\/login$/)
    } finally {
      await anonymous.close()
    }
    assert.doesNotMatch(await page.content(), /fixture-cloudinary-secret|sb_secret_fixture/)
    await page.getByLabel('Title').fill('Fixture image')
    await file.setInputFiles({ name: 'fixture.png', mimeType: 'image/png', buffer: bytes })
    await submitUpload.click()
    await page.getByRole('heading', { name: 'Fixture image' }).waitFor()
    assert.equal(drafts.size, 2)
    assert.equal(await page.getByRole('img', { name: 'Fixture image' }).count(), 1)
    await page.getByLabel('Title').fill('Revoked upload')
    await file.setInputFiles({ name: 'fixture.mp4', mimeType: 'video/mp4', buffer: bytes })
    membership = 'disabled'
    await submitUpload.click()
    await assertDenied('?error=denied')
    assert.equal(uploads.size, 2)
    membership = 'active'
    await submit(owner)
    await dashboard.waitFor()
  })

  // Seed a session issued by the local fixture whose access token needs refreshing.
  const expired = { ...session(owner, -600), expires_at: Math.floor(Date.now() / 1000) - 600 }
  await page.context().addCookies([{ name: cookieName, domain: '127.0.0.1', path: '/admin', httpOnly: true,
    value: 'base64-' + Buffer.from(JSON.stringify(expired)).toString('base64url') }])
  await page.reload()
  await dashboard.waitFor()
  assert.equal(refreshes, 1)
  assert.notEqual((await cookie()).value, authenticated.value)

  await page.getByRole('button', { name: 'Sign out' }).click()
  await assertDenied('')
  assert.equal(await cookie(), undefined)
  await page.goto(admin)
  await assertDenied('')

  await submit(owner)
  await dashboard.waitFor()
  const count = logouts
  membership = 'disabled'
  await page.getByRole('button', { name: 'Sign out' }).click()
  await assertDenied('?error=denied')
  assert.equal(logouts, count, 'The action must reject a membership revoked after the page rendered')
  await page.goto(admin)
  await assertDenied('?error=denied')
})
