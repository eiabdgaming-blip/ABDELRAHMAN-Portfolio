import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { test } from 'node:test'
import { chromium } from 'playwright-core'
import { startBuiltServer } from './server.mjs'

const owner = { id: '9d9c9e8e-6960-4402-99bf-e9cb1869b12b', email: 'owner@example.test' }
const visitor = { id: 'c66e11b3-e230-49ab-bd12-5077a3121e8c', email: 'visitor@example.test' }
const password = 'fixture-password'
const publicKey = 'sb_publishable_local-test'

test('admin sign-in, membership enforcement, refresh and logout against a local Supabase stub', async (t) => {
  const tokens = new Map()
  const refreshTokens = new Map()
  let serial = 0
  let membership = 'active'
  let logouts = 0
  let refreshes = 0

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
    if (req.headers.apikey !== publicKey) return send(401, {})
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

  const server = await startBuiltServer({ env: {
    NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:' + stub.address().port,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publicKey,
  } })
  t.after(server.stop)
  const browser = await chromium.launch({ channel: 'msedge' })
  t.after(() => browser.close())
  const page = await browser.newPage()
  page.setDefaultTimeout(6500)
  const admin = server.origin + '/admin'
  const login = admin + '/login'
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
