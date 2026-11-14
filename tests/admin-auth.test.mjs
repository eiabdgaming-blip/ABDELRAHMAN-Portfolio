import assert from 'node:assert/strict'
import { createServer, get } from 'node:http'
import { once } from 'node:events'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
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

test('admin auth, media and site content against local provider stubs', async (t) => {
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
  const copies = new Map()
  const cdn = 'https://res.cloudinary.com/fixture-media'
  let cdnReady = false
  const projects = new Map()
  const feedback = new Map()
  const leads = new Map()
  const submissions = new Map()
  const voices = new Map()
  const oggBytes = await readFile(new URL('./fixtures/voice-opus.ogg', import.meta.url))
  const mp3Bytes = await readFile(new URL('./fixtures/voice.mp3', import.meta.url))
  const voiceBytes = Buffer.alloc(44 + 48000)
  voiceBytes.write('RIFF'); voiceBytes.writeUInt32LE(voiceBytes.length - 8, 4)
  voiceBytes.write('WAVEfmt ', 8); voiceBytes.writeUInt32LE(16, 16)
  voiceBytes.writeUInt16LE(1, 20); voiceBytes.writeUInt16LE(1, 22)
  voiceBytes.writeUInt32LE(8000, 24); voiceBytes.writeUInt32LE(16000, 28)
  voiceBytes.writeUInt16LE(2, 32); voiceBytes.writeUInt16LE(16, 34)
  voiceBytes.write('data', 36); voiceBytes.writeUInt32LE(48000, 40)
  for (let i = 44; i < voiceBytes.length; i += 2) voiceBytes.writeInt16LE(Math.round(1000 * Math.sin(i / 9)), i)
  const content = {
    site_services: [{ id: 'video-editing', title: 'Video Editing', description: 'Approved fixture copy.', display_order: 10, visible: true }],
    site_faq: [{ id: randomUUID(), question: 'Existing question?', answer: 'Existing answer.', display_order: 10, published: true }],
    site_contact: [{ id: true, email: 'owner@example.test', whatsapp: 'https://wa.me/201007372106',
      instagram: 'https://www.instagram.com/abdo_ve1/', tiktok: 'https://www.tiktok.com/@abdo_ve_1' }],
  }

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
    const body = async () => {
      let raw = ''
      for await (const chunk of req) raw += chunk
      return raw
    }
    if (url.pathname.startsWith('/fixture-media/')) {
      if (/\/abdel-voice-[\da-f-]+\.(wav|ogg|mp3)$/.test(url.pathname)) {
        const voiceFile = url.pathname.split('/').at(-1)
        const derivative = url.pathname.includes('/br_64k/')
        const suffix = voiceFile.slice(-3)
        const data = suffix === 'wav' ? voiceBytes : suffix === 'ogg' ? oggBytes : mp3Bytes
        const signature = createHash('sha256').update((derivative ? 'br_64k/' : '') + voiceFile + cloudSecret).digest('base64url').slice(0, 8)
        if (!url.pathname.includes('/authenticated/s--' + signature + '--/') || !uploads.has(voiceFile.slice(0, -4))) return send(401, {})
        const match = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range ?? '')
        const start = Number(match?.[1] ?? 0)
        if (start >= data.length) return res.writeHead(416, { 'content-range': `bytes */${data.length}` }).end()
        const end = Math.min(Number(match?.[2] || data.length - 1), data.length - 1)
        const headers = { 'content-type': suffix === 'mp3' ? 'audio/mpeg' : 'audio/' + suffix,
          'accept-ranges': 'bytes', 'content-length': end - start + 1 }
        if (match) headers['content-range'] = `bytes ${start}-${end}/${data.length}`
        return res.writeHead(match ? 206 : 200, headers).end(data.subarray(start, end + 1))
      }
      const copy = copies.get(url.pathname.split('/').at(-1).split('.')[0])
      if (!copy || !cdnReady) return send(404, {})
      if (url.pathname.endsWith('.mp4')) {
        assert.equal(req.headers.range, 'bytes=0-1')
        return res.writeHead(206, { 'content-type': 'video/mp4', 'content-range': 'bytes 0-1/9999' }).end('00')
      }
      return res.writeHead(200, { 'content-type': url.pathname.endsWith('.webp') ? 'image/webp' : 'image/jpeg' }).end()
    }
    if (url.pathname.startsWith('/v1_1/fixture-media/')) {
      if (req.headers.authorization !== 'Basic ' + Buffer.from(cloudKey + ':' + cloudSecret).toString('base64')) return send(401, {})
      if (url.pathname.endsWith('/upload') && req.method === 'POST') {
        const resource = url.pathname.split('/').at(-2)
        const form = await new Response(await body(), { headers: { 'content-type': req.headers['content-type'] } }).formData()
        const input = new URL(form.get('file'))
        const { signature, api_key, ...parameters } = Object.fromEntries(input.searchParams)
        assert.equal(input.origin + input.pathname, cloudApi + '/' + resource + '/download')
        assert.equal(parameters.type, 'authenticated')
        assert.equal(api_key, cloudKey)
        assert.equal(signature, digest(parameters))
        if (form.get('public_id').startsWith('abdel-feedback-')) {
          assert.equal(form.get('type'), 'upload')
          assert.match(form.get('transformation'), /fl_force_strip/)
          const output = { public_id: form.get('public_id'), resource_type: 'image',
            type: 'upload', format: 'webp', width: 160, height: 160, version: 1 }
          copies.set(output.public_id, output)
          return send(200, output)
        }
        assert.equal(form.get('async'), 'true')
        assert.equal(form.get('eager_async'), 'true')
        assert.equal(form.get('overwrite'), 'false')
        assert.equal(form.get('type'), 'upload')
        if (resource === 'video') {
          assert.match(form.get('transformation'), /c_limit,f_mp4,fl_force_strip,h_1280,vc_h264,w_1280/)
          assert.match(form.get('eager'), /w_360\/jpg\|.*w_720\/jpg/)
        }
        copies.set(form.get('public_id'), {
          public_id: form.get('public_id'), asset_id: 'f'.repeat(32), resource_type: resource, type: 'upload',
          format: form.get('format'), width: 640, height: 360, version: 1,
        })
        return send(200, { status: 'pending' })
      }
      if (url.pathname.includes('/upload/')) {
        const copy = copies.get(url.pathname.split('/').at(-1))
        return send(copy ? 200 : 404, copy ?? {})
      }
      const asset = uploads.get(url.pathname.split('/').at(-1))
      if (!asset || !url.pathname.includes('/' + asset.resource_type + '/authenticated/')) return send(404, {})
      if (asset.resource_type === 'video' && url.searchParams.get('media_metadata') !== 'true') return send(400, {})
      return send(200, verificationMismatch ? { ...asset, type: 'upload' } : asset)
    }
    if (url.pathname === '/rest/v1/media_assets' && req.method === 'POST') {
      if (req.headers.apikey !== writerKey || membership !== 'active') return send(403, {})
      if (databaseUnavailable) return send(503, {})
      const draft = JSON.parse(await body())
      const asset = uploads.get(draft.cloudinary_public_id)
      if (!asset || draft.owner_id !== owner.id || draft.status !== 'draft' ||
        draft.delivery_type !== 'authenticated' || draft.cloudinary_asset_id !== asset.asset_id) return send(400, {})
      drafts.set(draft.id, {
        placement: 'work', project_format: 'reel', featured: false, display_order: 0, publication_revision: 0,
        ...draft, created_at: new Date().toISOString(),
      })
      return send(201, {})
    }
    if (url.pathname === '/rest/v1/rpc/change_media_publication') {
      const args = JSON.parse(await body())
      if (req.headers.apikey !== writerKey || args.p_actor !== owner.id || membership !== 'active') return send(403, {})
      const asset = drafts.get(args.p_id)
      if (asset?.publication_revision !== args.p_revision) return send(200, 'stale')
      if (args.p_command === 'queue') {
        if (asset.preparation_started_at) return send(200, 'pending')
        asset.preparation_started_at = new Date().toISOString()
        return send(200, 'queued')
      }
      if (args.p_command === 'hide') asset.status = 'hidden'
      else Object.assign(asset, args.p_settings)
      if (args.p_command === 'publish') {
        assert.ok(cdnReady && args.p_delivery.url.startsWith(cdn))
        asset.status = 'published'
        asset.public_delivery = args.p_delivery
      }
      asset.publication_revision++
      return send(200, 'saved')
    }
    if (url.pathname.endsWith('/rest/v1/portfolio_voice_notes')) {
      if (req.method === 'POST' && req.headers.apikey === writerKey && membership === 'active') {
        const note = JSON.parse(await body())
        voices.set(note.id, note)
        return send(201, {})
      }
      if (user?.id !== owner.id || membership !== 'active') return send(403, {})
      const id = url.searchParams.get('id')?.slice(3)
      return send(200, [...voices.values()].filter((row) => !id || row.id === id))
    }
    if (url.pathname.endsWith('/rest/v1/portfolio_feedback') && req.headers.apikey === writerKey) {
      const entry = feedback.get(url.searchParams.get('id')?.slice(3))
      return send(200, entry?.status === 'published' && entry.voice_approved ? [{ voice: voices.get(entry.voice_id) }] : [])
    }
    if (/\/rpc\/(save_portfolio_entry|save_feedback_attachments)$/.test(url.pathname)) {
      const { p_actor, p_kind = 'feedback', p_id, p_revision, p_payload } = JSON.parse(await body())
      if (req.headers.apikey !== writerKey || p_actor !== owner.id || membership !== 'active') return send(403, {})
      const entries = p_kind === 'project' ? projects : feedback
      if (p_id && entries.get(p_id)?.revision !== p_revision) return send(200, null)
      if (p_kind === 'delete-feedback') {
        entries.delete(p_id)
        return send(200, p_id)
      }
      const id = p_id ?? randomUUID()
      const row = { ...p_payload, id, revision: p_id ? p_revision + 1 : 0 }
      if (p_kind === 'project') {
        row.portfolio_project_media = row.media.map(({ id: asset_id, order: display_order }) => ({ asset_id, display_order }))
        row.portfolio_case_studies = row.study
      } else row.portfolio_feedback_services = row.services.map((service_id) => ({ service_id }))
      entries.set(id, row)
      return send(200, id)
    }
    if (url.pathname.endsWith('/rpc/submit_contact_lead')) {
      if (req.headers.apikey !== writerKey) return send(403, {})
      const { p_token, p_fingerprint, p_email_key, p_phone_key, p_lead } = JSON.parse(await body())
      const past = submissions.get(p_token)
      if (past) return send(200, past.hash === p_fingerprint ? 'saved' : 'conflict')
      if ([...submissions.values()].some(({ hash }) => hash === p_fingerprint)) return send(200, 'saved')
      if ([...submissions.values()].filter(({ email, phone }) =>
        (email && email === p_email_key) || (phone && phone === p_phone_key)).length >= 3) return send(200, 'limited')
      submissions.set(p_token, { hash: p_fingerprint, email: p_email_key, phone: p_phone_key })
      const id = randomUUID()
      leads.set(id, { ...p_lead, id, status: 'new', owner_notes: '', created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      return send(200, 'saved')
    }
    if (req.headers.apikey !== publicKey) return send(401, {})
    if (url.pathname.endsWith('/rest/v1/contact_leads')) {
      if (user?.id !== owner.id || membership !== 'active') return send(403, {})
      const status = url.searchParams.get('status')?.slice(3)
      const filter = url.searchParams.get('or')
      const search = filter?.match(/name\.ilike\."%([^%]+)%"/)?.[1].toLowerCase()
      const rows = [...leads.values()].filter((row) => (!status || row.status === status) &&
        (!search || row.name.toLowerCase().includes(search) || row.email?.toLowerCase().includes(search)))
      if (req.method === 'HEAD') return res.writeHead(200, { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` }).end()
      if (req.method === 'PATCH') {
        const lead = leads.get(url.searchParams.get('id')?.slice(3))
        if (!lead || lead.updated_at !== url.searchParams.get('updated_at')?.slice(3)) return send(200, [])
        Object.assign(lead, JSON.parse(await body()), { updated_at: new Date().toISOString() })
        return send(200, [{ id: lead.id }])
      }
      return send(200, rows)
    }
    const table = url.pathname.split('/').at(-1)
    if (table === 'portfolio_projects' || table === 'portfolio_feedback') {
      if (user?.id !== owner.id || membership !== 'active') return send(200, [])
      return send(200, [...(table === 'portfolio_projects' ? projects : feedback).values()])
    }
    if (table.startsWith('portfolio_public_')) {
      const publicAsset = (id) => {
        const row = drafts.get(id)
        if (!row || row.status !== 'published') return null
        const delivery = row.public_delivery
        return { id, title: row.title, kind: row.resource_type, url: delivery.url, poster: delivery.poster,
          small_poster: delivery.poster_small, width: delivery.width, height: delivery.height, duration: row.duration }
      }
      const publicProjects = [...projects.values()].filter(({ status }) => status === 'published').flatMap((row) => {
        const media = row.media.slice().sort((a, b) => a.order - b.order).map(({ id }) => publicAsset(id)).filter(Boolean)
        const cover = publicAsset(row.cover_id) ?? media[0]
        return !cover ? [] : [{ ...row, media, lead: media.find(({ kind }) => kind === 'video') ?? null,
          poster_url: cover.poster, poster_small_url: cover.small_poster }]
      })
      if (table === 'portfolio_public_feedback') return send(200, [...feedback.values()]
        .filter(({ status }) => status === 'published').map((entry) => {
          const project = publicProjects.find(({ id }) => id === entry.project_id)
          return { ...entry, avatar: entry.attachment_public?.avatar ?? publicAsset(entry.avatar_id)?.small_poster,
            proof: entry.proof_approved ? entry.attachment_public?.proof ?? publicAsset(entry.proof_id)?.poster : null,
            voice_duration: entry.voice_approved ? voices.get(entry.voice_id)?.duration : null,
            services: entry.services.map((id) => content.site_services.find((row) => row.id === id && row.visible)?.title).filter(Boolean),
            work_title: project?.title, work_poster: project?.poster_url, work_slug: project?.slug }
        }))
      if (table === 'portfolio_public_case_studies') return send(200, publicProjects
        .filter((row) => row.presentation === 'case-study' && row.slug === url.searchParams.get('slug')?.slice(3))
        .map((row) => ({ ...row, ...row.study })))
      if (table === 'portfolio_public_projects') return send(200, publicProjects
        .filter(({ featured }) => !url.searchParams.has('featured') || featured))
      // Preserve the earlier provider fixture for the Phase 03.2B regression checks.
      if (!projects.size) return send(404, { code: 'PGRST205' })
      const attached = new Set(publicProjects.flatMap(({ media }) => media.map(({ id }) => id)))
      const standalone = [...drafts.values()].filter((row) => row.resource_type === 'video' &&
        row.status === 'published' && row.placement !== 'home' && !attached.has(row.id)).map((row) => {
        const lead = publicAsset(row.id)
        return { ...row, slug: null, media: [], lead, poster_url: lead.poster, poster_small_url: lead.small_poster }
      })
      return send(200, [...publicProjects, ...standalone].filter((row) => row.project_format === url.searchParams.get('project_format')?.slice(3)))
    }
    if (Object.hasOwn(content, table)) {
      const active = user?.id === owner.id && membership === 'active'
      const rows = content[table]
      const id = url.searchParams.get('id')?.slice(3)
      if (req.method === 'GET') {
        return send(200, rows.filter((row) => (id === undefined || String(row.id) === id) &&
          (table === 'site_contact' || (active && !url.searchParams.has('visible') && !url.searchParams.has('published')) ||
            row.visible || row.published)).sort((a, b) => a.display_order - b.display_order))
      }
      if (!active) return send(403, {})
      if (req.method === 'POST') {
        const row = { id: randomUUID(), ...JSON.parse(await body()) }
        rows.push(row)
        return send(201, [{ id: row.id }])
      }
      const index = rows.findIndex((row) => String(row.id) === id)
      if (index < 0) return send(200, [])
      const row = rows[index]
      if (req.method === 'DELETE') rows.splice(index, 1)
      else Object.assign(row, JSON.parse(await body()))
      return send(200, [{ id: row.id }])
    }
    if (url.pathname === '/rest/v1/published_portfolio_media') {
      const format = url.searchParams.get('project_format')?.slice(3)
      const featured = url.searchParams.get('featured') === 'eq.true'
      const placement = url.searchParams.get('placement')
      const category = url.searchParams.get('category')
      const rows = [...drafts.values()].filter((asset) => asset.status === 'published' && asset.resource_type === 'video' &&
        asset.project_format === format && (!featured || asset.featured) &&
        placement.includes(asset.placement) && (!category || category.includes(asset.category)))
      rows.sort((a, b) => a.display_order - b.display_order)
      return send(200, rows.map((asset) => ({
        id: asset.id, title: asset.title, description: asset.description, project_format: asset.project_format,
        category: asset.category, playback_url: asset.public_delivery.url, poster_url: asset.public_delivery.poster,
        poster_small_url: asset.public_delivery.poster_small, width: asset.public_delivery.width,
        height: asset.public_delivery.height, duration: asset.duration,
      })))
    }
    if (url.pathname === '/rest/v1/media_assets') {
      if (user?.id !== owner.id || membership !== 'active') return send(403, {})
      const id = url.searchParams.get('id')?.slice(3)
      const images = url.searchParams.get('resource_type') === 'eq.image'
      const rows = [...drafts.values()].filter((draft) =>
        (!id || draft.id === id) && (!images || draft.resource_type === 'image') &&
        (!url.searchParams.has('status') || url.searchParams.get('status') === 'eq.' + draft.status) &&
        (!url.searchParams.has('featured') || draft.featured))
      if (req.method === 'HEAD') return res.writeHead(200, { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` }).end()
      return send(200, rows)
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
      if ((url.origin === 'https://api.cloudinary.com' && url.pathname.startsWith('/v1_1/fixture-media/')) ||
          (url.origin === 'https://res.cloudinary.com' && url.pathname.startsWith('/fixture-media/'))) {
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
  await page.goto(admin + '/content/services')
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

  await t.test('Admin dashboard stays within the viewport and exposes its keyboard skip target', async () => {
    const original = page.viewportSize()
    try {
      for (const width of [390, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 })
        await page.reload()
        await dashboard.waitFor()
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}px`)
        await page.keyboard.press('Tab')
        assert.equal(await page.evaluate(() => document.activeElement?.className), 'skip-link')
        await page.keyboard.press('Enter')
        assert.equal(await page.evaluate(() => document.activeElement?.id), 'main')
        await page.keyboard.press('Tab')
        assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Media Library')
      }
    } finally {
      await page.setViewportSize(original)
      await page.goto(admin)
    }
  })

  await t.test('validates input, verifies provider metadata and retries the draft insert without re-uploading', async () => {
    await page.getByRole('link', { name: 'Media Library' }).click()
    await page.waitForURL(media)
    await page.getByRole('heading', { name: 'Media Library' }).waitFor()
    const file = page.getByLabel('File')
    const uploadTitle = page.locator('form').filter({ has: file }).getByLabel('Title')
    const submitUpload = page.getByRole('button', { name: 'Upload draft' })
    const retry = page.getByRole('button', { name: 'Retry saving' })
    await uploadTitle.fill('Fixture video')
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
    await uploadTitle.fill('Fixture image')
    await file.setInputFiles({ name: 'fixture.png', mimeType: 'image/png', buffer: bytes })
    await submitUpload.click()
    await page.getByRole('heading', { name: 'Fixture image' }).waitFor()
    assert.equal(drafts.size, 2)
    assert.equal(await page.getByRole('img', { name: 'Fixture image' }).count(), 1)
    await uploadTitle.fill('Revoked upload')
    await file.setInputFiles({ name: 'fixture.mp4', mimeType: 'video/mp4', buffer: bytes })
    membership = 'disabled'
    await submitUpload.click()
    await assertDenied('?error=denied')
    assert.equal(uploads.size, 2)
    membership = 'active'
    await submit(owner)
    await dashboard.waitFor()
  })

  await t.test('publishes verified copies to selected sections and hides them without changing the Admin player', async () => {
    const publicPage = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    const videoBytes = await readFile(new URL('../public/videos/showreel.mp4', import.meta.url))
    await publicPage.route(cdn + '/**', async (route) => {
      if (!route.request().url().endsWith('.mp4')) return route.fulfill({ status: 200, body: '' })
      const [, first, last] = /^bytes=(\d+)-(\d*)$/.exec(route.request().headers().range ?? '') ?? []
      const start = Number(first ?? 0)
      const end = last ? Math.min(+last, videoBytes.length - 1) : videoBytes.length - 1
      return route.fulfill({
        status: first === undefined ? 200 : 206,
        headers: { 'content-type': 'video/mp4', 'accept-ranges': 'bytes', 'content-range': `bytes ${start}-${end}/${videoBytes.length}` },
        body: videoBytes.subarray(start, end + 1),
      })
    })
    const home = server.origin + '/'
    const work = home + 'work'
    const homeReels = publicPage.getByRole('region', { name: 'Featured reels' })
    const play = publicPage.getByRole('button', { name: 'Play Published test Reel', exact: true })
    await publicPage.goto(home)
    assert.equal(await homeReels.count(), 0)
    assert.match(await publicPage.locator('.hero-poster video').getAttribute('src'), /^\/videos\/showreel\.mp4$/)
    await page.goto(media)
    const card = page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: 'Fixture video' }) })
    const originalPreview = await card.locator('video').getAttribute('src')
    assert.equal(await card.locator('video').getAttribute('preload'), 'none')
    assert.notEqual(await card.locator('video').getAttribute('controls'), null)
    await card.getByText('Publication settings', { exact: true }).click()
    await card.getByLabel('Title').fill('Published test Reel')
    await card.getByLabel('Placement').selectOption('both')
    await card.getByLabel('Feature on Home').check()
    await card.getByLabel('Display order').fill('10')
    await card.getByLabel('Work category').selectOption('product')
    page.once('dialog', (dialog) => dialog.dismiss())
    await card.getByRole('button', { name: 'Publish', exact: true }).click()
    assert.equal(copies.size, 0)
    const accept = () => page.once('dialog', (dialog) => dialog.accept())
    accept()
    await card.getByRole('button', { name: 'Publish', exact: true }).click()
    await card.getByText(/Cloudinary is preparing/).waitFor()
    assert.equal(copies.size, 1)
    assert.equal(await card.getByText('draft', { exact: true }).count(), 1)
    accept()
    await card.getByRole('button', { name: 'Check and publish', exact: true }).click()
    await card.getByText(/Cloudinary is preparing/).waitFor()
    assert.equal(copies.size, 1)
    await publicPage.reload()
    assert.equal(await homeReels.count(), 0)
    cdnReady = true
    accept()
    await card.getByRole('button', { name: 'Check and publish', exact: true }).click()
    const published = page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: 'Published test Reel' }) })
    await published.getByText('published', { exact: true }).waitFor()
    assert.equal(await published.locator('video').getAttribute('src'), originalPreview)

    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      await publicPage.setViewportSize(viewport)
      const result = await publicPage.goto(home)
      assert.doesNotMatch(await result.text(), /fixture-cloudinary-secret|sb_secret_fixture|abdel-media-/)
      await homeReels.waitFor()
      const reel = homeReels.locator('video')
      assert.equal(await reel.getAttribute('src'), null)
      const poster = homeReels.locator('picture img')
      await poster.scrollIntoViewIfNeeded()
      await publicPage.waitForFunction(() => document.querySelector('#reels picture img')?.currentSrc.includes('w_360'))
      await play.click()
      await homeReels.getByRole('button', { name: 'Pause Published test Reel' }).waitFor()
      await reel.evaluate((node) => { node.muted = true })
      await publicPage.waitForFunction(() => document.querySelector('.home-rail video')?.currentTime > 0.15)
      assert.equal(await publicPage.getByRole('dialog').count(), 0)
      assert.match(await reel.getAttribute('src'), /\/video\/upload\//)
    }

    await publicPage.goto(work + '?category=product')
    await publicPage.getByRole('region', { name: 'Work reels' }).getByRole('button', { name: 'Play Published test Reel' }).waitFor()
    await publicPage.goto(work + '?category=travel')
    assert.equal(await publicPage.getByRole('region', { name: 'Work reels' }).count(), 0)
    const extra = ['home-only', 'both'].map((id, index) => ({
      ...[...drafts.values()].find(({ resource_type }) => resource_type === 'video'),
      id, title: id, placement: index ? 'both' : 'home', display_order: 8 + index,
    }))
    for (const asset of extra) drafts.set(asset.id, asset)
    await publicPage.setViewportSize({ width: 1440, height: 900 })
    await publicPage.goto(home)
    assert.equal(await homeReels.locator('.reel-cover').count(), 3)
    await homeReels.getByRole('button', { name: 'Go to reel 1' }).click()
    assert.match(await homeReels.locator('[data-slot="active"] .inline-toggle').getAttribute('aria-label'), /home-only/)
    await publicPage.setViewportSize({ width: 390, height: 844 })
    await publicPage.waitForFunction(() => document.querySelectorAll('.home-rail .reel-cover[inert]').length === 2)
    await publicPage.goto(work)
    assert.equal(await publicPage.getByRole('button', { name: 'Play home-only', exact: true }).count(), 0)
    for (const asset of extra) drafts.delete(asset.id)
    const form = published.getByRole('form')
    await form.getByLabel('Placement').selectOption('work')
    await form.getByLabel('Format').selectOption('long-form')
    await form.getByLabel('Long-form description').fill('A test clip.')
    accept()
    await form.getByRole('button', { name: 'Save settings' }).click()
    await form.getByText('Display settings saved.').waitFor()
    await publicPage.goto(home)
    assert.equal(await homeReels.count(), 0)
    await publicPage.goto(work + '?format=long-form')
    const opener = publicPage.getByRole('button', { name: 'Open Published test Reel' })
    await opener.click()
    const dialog = publicPage.getByRole('dialog')
    await dialog.getByRole('button', { name: 'Play video' }).click()
    await dialog.getByRole('button', { name: 'Pause', exact: true }).waitFor()
    await dialog.getByRole('button', { name: 'Close' }).click()
    await dialog.waitFor({ state: 'hidden' })
    await publicPage.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Open Published test Reel')

    accept()
    await form.getByRole('button', { name: 'Hide', exact: true }).click()
    await published.getByText('hidden', { exact: true }).waitFor()
    await publicPage.reload()
    assert.equal(await opener.count(), 0)
    assert.equal(await published.locator('video').getAttribute('src'), originalPreview)
    const image = page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: 'Fixture image' }) })
    await image.getByText('Publication settings', { exact: true }).click()
    accept()
    await image.getByRole('button', { name: 'Publish', exact: true }).click()
    await image.getByText(/Cloudinary is preparing/).waitFor()
    accept()
    await image.getByRole('button', { name: 'Check and publish', exact: true }).click()
    await image.getByText('published', { exact: true }).waitFor()
    await publicPage.reload()
    assert.equal(await publicPage.getByText('Fixture image', { exact: true }).count(), 0)

    membership = 'disabled'
    accept()
    await form.getByRole('button', { name: 'Publish', exact: true }).click()
    await assertDenied('?error=denied')
    assert.equal([...drafts.values()].find(({ resource_type }) => resource_type === 'video').status, 'hidden')
    membership = 'active'
    await submit(owner)
    await dashboard.waitFor()
    await publicPage.close()
  })

  await t.test('owner manages site content and sees database counts', async () => {
    const homepage = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    try {
      const count = async (label) => (await page.locator('dl div').filter({ has: page.getByText(label, { exact: true }) }).locator('dd').textContent())
      assert.equal(await count('Total media assets'), '2')
      assert.equal(await count('Published'), '1')
      assert.equal(await count('Draft'), '0')
      assert.equal(await count('Hidden'), '1')
      assert.equal(await count('Featured Home Reels'), '0')
      await page.getByRole('link', { name: 'Services', exact: true }).click()
      const add = page.getByRole('form', { name: 'Add service', exact: true })
      await add.getByLabel('Title').fill('CMS test service')
      await add.getByLabel('Description').fill('A description from the test database.')
      await add.getByLabel('Display order').fill('0')
      await add.getByRole('button', { name: 'Add service' }).click()
      await add.getByRole('status').waitFor()
      const service = page.locator('summary').filter({ hasText: 'CMS test service' })
      await service.click()
      const serviceForm = page.getByRole('form', { name: 'CMS test service' })
      await homepage.goto(server.origin)
      assert.equal(await homepage.getByRole('heading', { name: 'CMS test service' }).count(), 0)
      await serviceForm.getByLabel('Visibility').selectOption('yes')
      await serviceForm.getByRole('button', { name: 'Save changes' }).click()
      await serviceForm.getByRole('status').waitFor()
      const link = homepage.getByRole('link', { name: 'Ask about CMS test service' })
      await homepage.reload()
      assert.equal(await homepage.locator('#services li').first().getByRole('heading').textContent(), 'CMS test service')
      await link.click()
      await homepage.waitForURL('**/?service=*#contact')
      assert.match(await homepage.locator('select[name="serviceId"] option:checked').textContent(), /CMS test service/)

      await page.goto(admin + '/content/faq')
      const addQuestion = page.getByRole('form', { name: 'Add question', exact: true })
      await addQuestion.getByLabel('Question', { exact: true }).fill('CMS test question?')
      await addQuestion.getByLabel('Answer').fill('A CMS answer.')
      await addQuestion.getByLabel('Display order').fill('0')
      await addQuestion.getByLabel('Visibility').selectOption('yes')
      await addQuestion.getByRole('button', { name: 'Add question' }).click()
      await addQuestion.getByRole('status').waitFor()
      await homepage.setViewportSize({ width: 390, height: 844 })
      await homepage.goto(server.origin + '/#faq')
      const question = homepage.getByRole('button', { name: 'CMS test question?' })
      assert.equal(await question.getAttribute('aria-expanded'), 'true')
      await question.click()
      assert.equal(await question.getAttribute('aria-expanded'), 'false')
      assert.ok(await homepage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      const questionEntry = page.locator('li').filter({ has: page.locator('summary').filter({ hasText: 'CMS test question?' }) })
      await questionEntry.locator('summary').filter({ hasText: 'CMS test question?' }).click()
      const questionForm = questionEntry.getByRole('form', { name: 'CMS test question?', exact: true })
      await questionForm.getByLabel('Visibility').selectOption('no')
      await questionForm.getByRole('button', { name: 'Save changes' }).click()
      await questionForm.getByRole('status').waitFor()
      await homepage.reload()
      assert.equal(await question.count(), 0)
      await questionEntry.getByText('Delete question', { exact: true }).click()
      const deletion = page.getByRole('form', { name: 'Delete CMS test question?' })
      await deletion.getByRole('button', { name: 'Delete permanently' }).click()
      assert.equal(content.site_faq.length, 2)
      await deletion.getByRole('checkbox').check()
      await deletion.getByRole('button', { name: 'Delete permanently' }).click()
      await deletion.waitFor({ state: 'detached' })
      await homepage.reload()
      assert.equal(await question.count(), 0)

      await page.goto(admin + '/content/services')
      await service.click()
      await serviceForm.getByLabel('Visibility').selectOption('no')
      await serviceForm.getByRole('button', { name: 'Save changes' }).click()
      await serviceForm.getByRole('status').waitFor()
      await homepage.goto(server.origin)
      assert.equal(await homepage.getByRole('heading', { name: 'CMS test service' }).count(), 0)

      await page.goto(admin + '/content/settings')
      const settings = page.getByRole('form', { name: 'Public contact settings' })
      await settings.getByLabel('Instagram profile').fill('https://instagram.com.evil.example/owner')
      await settings.getByRole('button', { name: 'Save settings' }).click()
      await settings.getByRole('alert').waitFor()
      assert.equal(content.site_contact[0].instagram, 'https://www.instagram.com/abdo_ve1/')
      await settings.getByLabel('Public email').fill('projects+portfolio@example.test')
      await settings.getByLabel('WhatsApp destination').fill('https://wa.me/201234567890')
      await settings.getByLabel('Instagram profile').fill('https://www.instagram.com/project.profile/')
      await settings.getByRole('button', { name: 'Save settings' }).click()
      await settings.getByRole('status').waitFor()
      await homepage.goto(server.origin + '/#contact')
      await homepage.reload()
      assert.match(await homepage.getByRole('link', { name: 'Email', exact: true }).getAttribute('href'), /^mailto:projects%2Bportfolio@example.test/)
      assert.equal(await homepage.locator('#contact').getByRole('link', { name: /Instagram/ }).getAttribute('href'), content.site_contact[0].instagram)
      await homepage.locator('input[name="name"]').fill('Test visitor')
      await homepage.locator('select[name="projectTypeId"]').selectOption('reels')
      await homepage.locator('select[name="serviceId"]').selectOption('video-editing')
      await homepage.locator('textarea[name="brief"]').fill('A project brief for testing.')
      await homepage.locator('input[name="email"]').fill('visitor@example.test')
      await homepage.route('https://wa.me/**', (route) => route.fulfill({ status: 200, body: 'Fixture' }))
      const outbound = homepage.waitForRequest('https://wa.me/**')
      await homepage.getByRole('button', { name: /Save inquiry/ }).click()
      await homepage.getByText(/Inquiry saved/).waitFor()
      await homepage.getByRole('link', { name: /Continue on WhatsApp/ }).click()
      const url = new URL((await outbound).url())
      assert.equal(url.pathname, '/201234567890')
      assert.match(url.searchParams.get('text'), /Service: Video Editing/)

      membership = 'disabled'
      await settings.getByLabel('Public email').fill('revoked@example.test')
      await settings.getByRole('button', { name: 'Save settings' }).click()
      await assertDenied('?error=denied')
      assert.equal(content.site_contact[0].email, 'projects+portfolio@example.test')
      membership = 'active'
      await submit(owner)
      await dashboard.waitFor()
    } finally {
      await homepage.close()
    }
  })

  await t.test('saves private leads once, filters and updates them as the active owner', async () => {
    const publicPage = await browser.newPage({ viewport: { width: 390, height: 844 } })
    try {
      await publicPage.goto(admin + '/leads')
      await publicPage.waitForURL(login)
      await publicPage.goto(server.origin + '/#contact')
      const form = publicPage.locator('.contact-form')
      const save = form.getByRole('button', { name: /Save inquiry/ })
      await save.click()
      await form.getByText('Enter your name.', { exact: true }).waitFor()
      await form.locator('[name="name"]').fill('Mobile lead')
      await form.locator('[name="projectTypeId"]').selectOption('reels')
      await form.locator('[name="serviceId"]').selectOption('video-editing')
      await form.locator('[name="brief"]').fill('A test inquiry <script>not executable</script>.')
      await form.locator('[name="email"]').fill('mobile@example.test')
      await form.locator('[name="whatsapp"]').fill('+201234567890')
      const pending = publicPage.waitForRequest((request) => request.url().endsWith('/api/contact'))
      await save.dblclick()
      const request = await pending
      await form.getByText(/Inquiry saved/).waitFor()
      const handoff = new URL(await form.getByRole('link', { name: /Continue on WhatsApp/ }).getAttribute('href'))
      assert.equal(handoff.pathname, '/201234567890')
      assert.match(handoff.searchParams.get('text'), /Mobile lead.*\nProject type: Reels & Shorts/)
      assert.match(await form.getByRole('link', { name: 'Contact by email' }).getAttribute('href'), /^mailto:projects%2Bportfolio@example.test/)
      assert.equal(leads.size, 2)
      const post = (data, extras = {}) => publicPage.request.post(server.origin + '/api/contact', { data, ...extras })
      const payload = request.postDataJSON()
      assert.equal((await post(payload)).status(), 200)
      assert.equal((await post({ ...payload, token: randomUUID() })).status(), 200)
      assert.equal((await post({ ...payload, brief: 'Changed' })).status(), 409)
      assert.equal((await post({ ...payload, token: randomUUID(), website: 'spam' })).status(), 400)
      assert.equal((await post({ ...payload, email: 'bad-email' })).status(), 422)
      assert.equal((await post({ ...payload, serviceId: 'unknown' })).status(), 422)
      assert.equal((await post({ ...payload, brief: 'x'.repeat(21000) })).status(), 413)
      assert.equal((await post(payload, { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status(), 403)
      assert.equal(leads.size, 2)
      for (let n = 1; n <= 3; n++) {
        const response = await post({ ...payload, token: randomUUID(), brief: 'Test rate limit ' + n })
        assert.equal(response.status(), n === 3 ? 429 : 200)
      }
      const inaccessible = await fetch(stubOrigin + '/rest/v1/contact_leads', { headers: { apikey: publicKey } })
      assert.equal(inaccessible.status, 403)

      await page.goto(admin)
      const total = page.locator('dl div').filter({ hasText: 'Total leads' }).locator('dd')
      assert.equal(await total.textContent(), '4')
      await page.getByRole('link', { name: 'Leads', exact: true }).click()
      await page.getByRole('heading', { name: 'Leads', exact: true }).waitFor()
      const filters = page.getByRole('form', { name: 'Filter leads' })
      await filters.getByLabel('Search by name or email').fill('mobile@example.test')
      await filters.getByRole('button', { name: 'Apply filters' }).click()
      await page.waitForURL(/q=mobile/)
      // Open the original submission identified by the full brief.
      const original = [...leads.values()].find(({ brief }) => brief.includes('not executable'))
      const row = page.locator('#lead-' + original.id)
      await row.locator('summary').click()
      assert.equal(await row.locator('script').count(), 0)
      assert.match(await row.getByRole('link', { name: 'Email mobile@example.test' }).getAttribute('href'), /^mailto:mobile@example.test/)
      assert.equal(await row.getByRole('link', { name: 'WhatsApp +201234567890' }).getAttribute('href'), 'https://wa.me/201234567890')
      await row.getByLabel('Status', { exact: true }).selectOption('in-progress')
      await row.getByLabel('Private owner notes').fill('Private fixture note')
      await row.getByRole('button', { name: 'Save changes' }).click()
      await row.getByText('Inquiry updated.').waitFor()
      assert.equal(original.status, 'in-progress')
      assert.equal(original.owner_notes, 'Private fixture note')
      await page.goto(admin)
      assert.equal(await page.locator('dl div').filter({ hasText: 'In-progress inquiries' }).locator('dd').textContent(), '1')
      await page.goto(admin + '/leads?status=in-progress')
      await row.locator('summary').click()
      await row.getByLabel('Status', { exact: true }).selectOption('archived')
      await row.getByRole('button', { name: 'Save changes' }).click()
      await page.getByText('No inquiries match.').waitFor()
      assert.equal(original.status, 'archived')
      await page.goto(admin + '/leads?status=archived')
      await row.locator('summary').click()
      membership = 'disabled'
      await row.getByLabel('Private owner notes').fill('Unauthorized edit')
      await row.getByRole('button', { name: 'Save changes' }).click()
      await assertDenied('?error=denied')
      assert.equal(original.owner_notes, 'Private fixture note')
      membership = 'active'
      await submit(owner)
      await dashboard.waitFor()
    } finally { await publicPage.close() }
  })

  await t.test('publishes project case studies and owner-approved feedback using prepared media', async () => {
    const [video] = [...drafts.values()].filter(({ resource_type }) => resource_type === 'video')
    const [image] = [...drafts.values()].filter(({ resource_type }) => resource_type === 'image')
    video.status = 'published'
    const home = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    try {
      await home.route(cdn + '/**', (route) => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="36"/>' }))
      await page.goto(admin + '/projects')
      await page.getByText('New project', { exact: true }).click()
      const project = page.getByRole('form', { name: 'New project' })
      await project.getByLabel('Title').fill('Test case study')
      await project.getByLabel('Slug').fill('test-case-study')
      await project.getByLabel('Open as').selectOption('case-study')
      await project.getByLabel('Cover or poster').selectOption(image.id)
      await project.getByText('Case Study text').click()
      await project.getByLabel('Project overview').fill('An owner-provided project overview.')
      await project.getByRole('button', { name: 'Add media' }).click()
      await project.getByRole('button', { name: 'Add media' }).click()
      await project.getByLabel('Asset 1').selectOption(video.id)
      await project.getByLabel('Asset 2').selectOption(image.id)
      await project.locator('[name="media_order"]').nth(0).fill('20')
      await project.getByLabel('Featured on Home').check()
      await project.getByRole('button', { name: 'Create entry' }).click()
      await project.getByRole('status').waitFor()
      assert.equal((await home.goto(server.origin + '/work/test-case-study')).status(), 404)
      const entry = page.locator('li').filter({ hasText: 'Test case study' })
      await entry.locator('summary').filter({ hasText: 'Test case study' }).click()
      const edit = entry.getByRole('form')
      await edit.getByLabel('Status').selectOption('published')
      await edit.getByRole('button', { name: 'Save changes' }).click()
      await edit.getByRole('status').waitFor()
      await home.goto(server.origin)
      await home.getByRole('region', { name: 'SELECTED WORK' }).getByRole('link', { name: 'Open Test case study' }).click()
      await home.getByRole('heading', { name: 'Project overview' }).waitFor()
      assert.equal(await home.locator('.portfolio-gallery > div').first().locator('video').count(), 0)
      for (const width of [390, 768, 1024, 1440]) {
        await home.setViewportSize({ width, height: 900 })
        assert.ok(await home.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Case study at ${width}px`)
        assert.equal(await home.locator('.portfolio-gallery video[src]').count(), 0)
      }
      await home.goto(server.origin + '/work?format=long-form')
      assert.equal(await home.getByRole('link', { name: 'Open Test case study' }).count(), 1)
      assert.equal(await home.getByRole('button', { name: 'Open Published test Reel' }).count(), 0)
      await edit.locator('[name="media_order"]').nth(1).fill('0')
      await edit.getByRole('button', { name: 'Save changes' }).click()
      await edit.getByRole('status').waitFor()
      await home.goto(server.origin + '/work/test-case-study')
      assert.equal(await home.locator('.portfolio-gallery > div').first().locator('video').count(), 1)

      await page.goto(admin + '/feedback')
      await page.getByText('New testimonial', { exact: true }).click()
      const testimonial = page.getByRole('form', { name: 'New testimonial' })
      await testimonial.getByLabel('Client name').fill('Browser test client')
      const longQuote = 'A browser fixture testimonial with detailed notes on the editing process and final delivery. '.repeat(13).trim()
      await testimonial.getByLabel('Testimonial').fill(longQuote)
      await testimonial.getByLabel('Redacted chat screenshot').selectOption(image.id)
      await testimonial.getByRole('img', { name: 'Redacted chat screenshot preview' }).waitFor()
      const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jkXcAAAAASUVORK5CYII=', 'base64')
      await page.unroute(cloudApi + '/**')
      await page.route(cloudApi + '/**', async (route) => {
        const cors = { 'access-control-allow-origin': server.origin, 'access-control-allow-methods': 'POST, OPTIONS' }
        if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
        if (!route.request().url().endsWith('/upload')) return route.abort()
        const form = await new Response(route.request().postDataBuffer(), { headers: { 'content-type': route.request().headers()['content-type'] } }).formData()
        const { signature, api_key, file, ...fields } = Object.fromEntries(form)
        assert.equal(signature, digest(fields))
        assert.equal(fields.type, 'authenticated')
        const extension = file.name.split('.').at(-1)
        const audio = ['wav', 'mp3', 'ogg'].includes(extension)
        if (audio) {
          if (extension === 'ogg') assert.equal(fields.eager, 'br_64k/mp3')
          else assert.equal(fields.transformation, 'fl_force_strip')
          assert.deepEqual(Buffer.from(await file.arrayBuffer()), extension === 'wav' ? voiceBytes : extension === 'ogg' ? oggBytes : mp3Bytes)
        }
        uploads.set(fields.public_id, { public_id: fields.public_id, asset_id: randomUUID().replaceAll('-', ''),
          format: extension === 'ogg' ? 'opus' : fields.allowed_formats, resource_type: audio ? 'video' : 'image', type: 'authenticated', bytes: file.size,
          derived: extension === 'ogg' ? [{ transformation: 'br_64k/mp3', format: 'mp3' }] : undefined,
          width: audio ? 0 : 1, height: audio ? 0 : 1, duration: audio ? 3 : undefined,
          version: +fields.timestamp, created_at: new Date().toISOString() })
        return route.fulfill({ headers: cors, json: {} })
      })
      await testimonial.getByLabel('Upload client photo').setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: png })
      await testimonial.getByRole('img', { name: 'Client photo preview' }).waitFor()
      await testimonial.getByRole('option', { name: 'photo.png · draft' }).waitFor({ state: 'attached' })
      await testimonial.getByRole('button', { name: 'Remove client photo' }).click()
      assert.equal(await testimonial.getByLabel('Client photo', { exact: true }).inputValue(), '')
      const photoId = [...drafts.values()].find(({ title }) => title === 'photo.png').id
      await testimonial.getByLabel('Client photo', { exact: true }).selectOption(photoId)
      await testimonial.getByLabel('Upload chat screenshot').setInputFiles({ name: 'redacted.png', mimeType: 'image/png', buffer: png })
      await testimonial.getByRole('option', { name: 'redacted.png · draft' }).waitFor({ state: 'attached' })
      const voiceInput = testimonial.getByLabel('Upload voice note (MP3, WAV or OGG)')
      await voiceInput.setInputFiles({ name: 'disguised.ogg', mimeType: 'audio/ogg', buffer: png })
      await testimonial.getByText('This file is not a supported audio recording.', { exact: false }).waitFor()
      assert.equal(voices.size, 0)
      for (const [format, mimeType, buffer] of [['wav', 'audio/wav', voiceBytes], ['mp3', 'audio/mpeg', mp3Bytes], ['ogg', 'application/ogg', oggBytes]]) {
        await voiceInput.setInputFiles({ name: 'note.' + format, mimeType, buffer })
        await testimonial.getByRole('option', { name: 'note.' + format + ' · draft' }).waitFor({ state: 'attached' })
      }
      const recording = [...voices.values()].find(({ format }) => format === 'ogg')
      await testimonial.getByText('Recording ready · 0:03').waitFor()
      assert.equal((await home.request.get(server.origin + '/api/feedback/voice/' + recording.id)).status(), 404)
      await testimonial.getByLabel('Instagram profile').fill('https://www.instagram.com/example.test/')
      await testimonial.getByLabel('TikTok profile').fill('https://www.tiktok.com/@example.test')
      await testimonial.getByLabel('LinkedIn profile').fill('https://www.linkedin.com/in/example-test/')
      await testimonial.getByLabel('Published project reference').selectOption([...projects.keys()][0])
      await testimonial.getByLabel('Video Editing').check()
      await testimonial.getByLabel('Status').selectOption('published')
      await testimonial.getByRole('button', { name: 'Create entry' }).click()
      await testimonial.getByRole('alert').waitFor()
      assert.equal(feedback.size, 0)
      await testimonial.getByLabel('I approve this redacted screenshot').check()
      await testimonial.getByRole('button', { name: 'Create entry' }).click()
      await testimonial.getByText('Approve the recording before publishing.').waitFor()
      assert.equal(feedback.size, 0)
      await testimonial.getByLabel('I approve this recording').check()
      await testimonial.getByRole('button', { name: 'Create entry' }).click()
      await testimonial.getByText('Changes saved.', { exact: true }).waitFor().catch(async (error) => {
        throw new Error((await testimonial.getByRole('alert').allTextContents()).join(' ') || error.message)
      })
      // Exercise a stored duration that disagrees with the browser's MP3 metadata.
      recording.duration = 269
      const extraCards = [
        { client_name: 'Arabic fixture', quote: 'تقييم تجريبي من أجل اختبار تخطيط بطاقة العميل. '.repeat(16).trim(), tiktok_url: 'https://www.tiktok.com/@fixture', instagram_url: 'https://instagram.com.invalid/fixture' },
        { client_name: 'LinkedIn fixture', quote: 'Short quote.', linkedin_url: 'https://www.linkedin.com/in/fixture/' },
        { client_name: 'No profile fixture', quote: 'A second, somewhat longer English quote that allows the wall to display different heights.' },
      ].map((values) => ({ id: randomUUID(), affiliation: '', status: 'published', services: [], ...values }))
      for (const item of extraCards) feedback.set(item.id, item)
      await home.goto(server.origin + '/#feedback')
      const card = home.locator('.feedback-card').filter({ hasText: 'Browser test client' })
      await card.locator('blockquote').waitFor()
      await card.getByText('Video Editing', { exact: true }).waitFor()
      assert.equal(await card.locator('header a svg').count(), 3)
      const arabic = home.locator('.feedback-card').filter({ hasText: 'Arabic fixture' })
      const linkedin = home.locator('.feedback-card').filter({ hasText: 'LinkedIn fixture' })
      assert.equal(await arabic.locator('header a').count(), 1)
      assert.equal(await arabic.locator('[data-primary]').getAttribute('data-platform'), 'TikTok')
      assert.equal(await linkedin.locator('[data-primary]').getAttribute('data-platform'), 'LinkedIn')
      assert.equal(await home.locator('.feedback-card').filter({ hasText: 'No profile fixture' }).locator('header a').count(), 0)
      assert.equal(await arabic.locator('blockquote p').evaluate((node) => getComputedStyle(node).direction), 'rtl')
      assert.equal(await card.locator('blockquote p').evaluate((node) => getComputedStyle(node).direction), 'ltr')
      const proofImage = card.locator('.proof-image img')
      await proofImage.scrollIntoViewIfNeeded()
      await home.waitForFunction(() => document.querySelector('.proof-image img')?.naturalWidth > 0)
      for (const [width, columns] of [[1440, 3], [768, 2], [390, 1]]) {
        await home.setViewportSize({ width, height: 900 })
        assert.equal(await home.locator('.feedback-wall').evaluate((node) => +getComputedStyle(node).columnCount), columns)
        assert.equal(await card.evaluate((node) => getComputedStyle(node).backgroundColor), 'rgb(253, 253, 254)')
        assert.deepEqual(await home.locator('.feedback-card h3').allTextContents(), ['Browser test client', ...extraCards.map(({ client_name }) => client_name)])
        const [photo, badge] = await Promise.all([card.locator('.feedback-avatar').boundingBox(), card.locator('[data-primary]').boundingBox()])
        assert.ok(badge.x > photo.x + photo.width / 2 && badge.x < photo.x + photo.width)
        assert.ok(badge.y > photo.y + photo.height / 2 && badge.y < photo.y + photo.height)
        assert.ok(badge.x + badge.width > photo.x + photo.width && badge.y + badge.height > photo.y + photo.height)
        assert.ok(await proofImage.evaluate((node) => Math.abs(node.width / node.height - node.naturalWidth / node.naturalHeight) < 0.025))
        assert.equal(await card.locator('.proof-image').evaluate((node) => getComputedStyle(node).borderTopWidth), '0px')
        assert.ok(await home.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
        const more = card.getByRole('button', { name: 'See more' })
        await more.waitFor()
        assert.equal(await more.getAttribute('aria-expanded'), 'false')
        const quote = card.locator('blockquote p')
        const collapsed = await quote.evaluate((node) => node.offsetHeight)
        assert.ok(await quote.evaluate((node) => Math.abs(node.offsetHeight / parseFloat(getComputedStyle(node).lineHeight) - 5) < 0.1))
        await more.press('Enter')
        const less = card.getByRole('button', { name: 'See less' })
        assert.equal(await less.getAttribute('aria-expanded'), 'true')
        assert.ok(await quote.evaluate((node) => node.offsetHeight) > collapsed)
        assert.equal(await quote.textContent(), longQuote)
        assert.equal(await card.locator('audio').count(), 1)
        assert.ok(await proofImage.isVisible())
        await less.click()
        assert.equal(await quote.evaluate((node) => node.offsetHeight), collapsed)
        assert.equal(await linkedin.getByRole('button', { name: 'See more' }).count(), 0)
      }
      await arabic.getByRole('button', { name: 'See more' }).click()
      assert.equal(await arabic.locator('blockquote p').textContent(), extraCards[0].quote)
      await arabic.getByRole('button', { name: 'See less' }).click()
      assert.equal(await card.getByRole('link', { name: 'Browser test client on LinkedIn' }).getAttribute('rel'), 'noopener noreferrer')
      assert.match(await card.locator('img.feedback-avatar').getAttribute('src'), /abdel-feedback-/)
      const audio = card.locator('audio')
      assert.equal(await audio.getAttribute('preload'), 'none')
      assert.equal(await audio.getAttribute('autoplay'), null)
      assert.equal(await audio.getAttribute('controls'), null)
      assert.equal(await card.locator('[data-voice-duration]').textContent(), '4:29')
      const voiceUrl = server.origin + await audio.getAttribute('src')
      const range = await home.request.get(voiceUrl, { headers: { Range: 'bytes=0-47' } })
      assert.equal(range.status(), 206)
      assert.equal(range.headers()['content-type'], 'audio/mpeg')
      // Next's Node route adapter strips Content-Length on streamed Responses.
      if (range.headers()['content-length']) assert.equal(range.headers()['content-length'], '48')
      assert.equal(range.headers()['accept-ranges'], 'bytes')
      assert.match(range.headers()['content-range'], /^bytes 0-47\//)
      assert.equal((await range.body()).length, 48)
      assert.equal((await home.request.get(voiceUrl, { headers: { Range: 'bytes=0-1,4-5' } })).status(), 416)
      assert.equal((await home.request.get(voiceUrl, { headers: { Range: 'bytes=900000-' } })).status(), 416)
      await home.route(voiceUrl, async (route) => {
        await card.getByText('Loading recording…').waitFor({ state: 'attached' })
        await route.continue()
      }, { times: 1 })
      await card.getByRole('button', { name: 'Play voice note' }).click()
      await home.waitForFunction(() => document.querySelector('.feedback-voice audio')?.currentTime > 0.2)
      assert.equal(await card.locator('[data-voice-duration]').textContent(), '0:03')
      await card.getByRole('button', { name: 'Pause voice note' }).click()
      assert.ok(await audio.evaluate((node) => node.paused))
      const timeline = card.getByRole('slider', { name: 'Seek voice note' })
      await timeline.press('End')
      await timeline.press('ArrowLeft')
      assert.ok(await audio.evaluate((node) => node.currentTime >= 2.8))
      await card.getByRole('button', { name: 'Play voice note' }).click()
      await card.getByRole('button', { name: 'Replay voice note' }).waitFor()
      await card.getByRole('button', { name: 'Replay voice note' }).click()
      assert.ok(await audio.evaluate((node) => node.currentTime < 1))
      await home.route(voiceUrl, (route) => route.fulfill({ status: 502 }))
      await home.reload()
      await card.getByRole('button', { name: 'Play voice note' }).click()
      await card.getByRole('button', { name: 'Retry voice note' }).waitFor()
      await card.getByText('Recording unavailable.', { exact: false }).waitFor()
      await home.unroute(voiceUrl)
      for (const item of extraCards) feedback.delete(item.id)
      await card.getByRole('button', { name: 'View approved chat screenshot' }).click()
      await home.getByRole('dialog').getByRole('img', { name: 'Approved chat screenshot' }).waitFor()
      await home.getByRole('button', { name: 'Close', exact: true }).click()
      await home.getByRole('dialog').waitFor({ state: 'hidden' })
      assert.ok(await home.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      assert.doesNotMatch(await card.innerHTML(), /\/authenticated\//)
      const row = page.locator('li').filter({ hasText: 'Browser test client' })
      await row.locator('summary').click()
      const editReview = row.getByRole('form')
      await editReview.getByLabel('Status').selectOption('hidden')
      await editReview.getByRole('button', { name: 'Save changes' }).click()
      await editReview.getByText('Changes saved.', { exact: true }).waitFor()
      await home.reload()
      assert.equal(await card.count(), 0)
      assert.equal((await home.request.get(voiceUrl)).status(), 404)
      page.once('dialog', (dialog) => dialog.accept())
      await editReview.getByRole('button', { name: 'Delete testimonial' }).click()
      await row.waitFor({ state: 'detached' })
      assert.equal(feedback.size, 0)
      await page.goto(admin + '/projects')
      await entry.locator('summary').filter({ hasText: 'Test case study' }).click()
      membership = 'disabled'
      await edit.getByLabel('Status').selectOption('hidden')
      await edit.getByRole('button', { name: 'Save changes' }).click()
      await assertDenied('?error=denied')
      assert.equal([...projects.values()][0].status, 'published')
      membership = 'active'
      await submit(owner)
      await dashboard.waitFor()
    } finally { await home.close() }
  })

  // Seed a session issued by the local fixture whose access token needs refreshing.
  const expired = { ...session(owner, -600), expires_at: Math.floor(Date.now() / 1000) - 600 }
  const expiredValue = 'base64-' + Buffer.from(JSON.stringify(expired)).toString('base64url')
  await page.context().addCookies([{ name: cookieName, domain: '127.0.0.1', path: '/admin', httpOnly: true,
    value: expiredValue }])
  await page.reload()
  await dashboard.waitFor()
  assert.equal(refreshes, 1)
  assert.notEqual((await cookie()).value, authenticated.value)
  assert.equal((await cookie()).secure, false)

  await t.test('Admin responses prevent framing and refresh cookies stay Secure beyond loopback', async () => {
    const login = await fetch(admin + '/login')
    assert.equal(login.status, 200)
    assert.equal(login.headers.get('x-frame-options'), 'DENY')
    assert.match(login.headers.get('content-security-policy'), /frame-ancestors 'none'/)
    assert.equal(login.headers.get('referrer-policy'), 'no-referrer')
    assert.equal(login.headers.get('x-content-type-options'), 'nosniff')
    const expiring = { ...session(owner, -600), expires_at: expired.expires_at }
    const value = 'base64-' + Buffer.from(JSON.stringify(expiring)).toString('base64url')
    const response = await new Promise((resolve, reject) => {
      get(admin, { headers: { Host: 'portfolio.example.test', Cookie: `${cookieName}=${value}` } }, (res) => {
        res.resume()
        resolve(res)
      }).on('error', reject)
    })
    assert.equal(response.statusCode, 200)
    assert.match(response.headers['cache-control'], /(?:^|,\s*)no-store(?:,|$)/)
    const refreshed = response.headers['set-cookie']?.find((header) => header.startsWith(cookieName + '='))
    assert.ok(refreshed, 'Refresh should set the session cookie')
    for (const attribute of [/; Secure\b/i, /; HttpOnly\b/i, /; SameSite=Lax\b/i, /; Path=\/admin\b/i]) {
      assert.match(refreshed, attribute)
    }
  })

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
