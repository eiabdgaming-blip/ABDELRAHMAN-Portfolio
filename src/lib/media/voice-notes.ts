import 'server-only'
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { cloudinaryConfig } from './cloudinary'
import { uuidPattern } from '../../domain/portfolio-cms'
import { voiceByteLimit, voiceDurationLimit, voiceFormats, voiceHeader, type VoiceFormat } from './voice-format'

type Cloud = NonNullable<ReturnType<typeof cloudinaryConfig>>
export type VoiceAsset = { id: string; format: VoiceFormat; version: number }
type Ticket = { owner: string; id: string; format: VoiceAsset['format']; bytes: number; title: string; timestamp: number }
const endpoint = (cloud: Cloud) => `https://api.cloudinary.com/v1_1/${cloud.cloud}`
const assetName = (id: string) => 'abdel-voice-' + id
const now = () => Math.floor(Date.now() / 1000)
const mac = (secret: string, value: string) => createHmac('sha256', secret).update('abdel-voice-v1:' + value).digest()
const mp3Transform = 'br_64k'

export function signVoice(cloud: Cloud, upload: Omit<Ticket, 'id' | 'timestamp'>) {
  const ticket: Ticket = { ...upload, id: randomUUID(), timestamp: now() }
  const body = Buffer.from(JSON.stringify(ticket)).toString('base64url')
  const fields = {
    allowed_formats: ticket.format, overwrite: 'false', public_id: assetName(ticket.id),
    timestamp: String(ticket.timestamp), type: 'authenticated',
    ...(ticket.format === 'ogg' ? { eager: mp3Transform + '/mp3' } : { transformation: 'fl_force_strip' }),
  }
  const params = Object.entries(fields).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => key + '=' + value).join('&')
  const signature = createHash('sha256').update(params + cloud.secret).digest('hex')
  return { ticket: body + '.' + mac(cloud.secret, body).toString('base64url'),
    url: endpoint(cloud) + '/video/upload', fields: { ...fields, api_key: cloud.key, signature } }
}

export function voiceTicket(cloud: Cloud, token: string, owner: string): Ticket {
  if (typeof token !== 'string' || token.length > 1800 || !/^[\w-]+\.[\w-]{43}$/.test(token)) throw new Error('Invalid voice upload ticket.')
  const [body, signature] = token.split('.')
  if (!timingSafeEqual(Buffer.from(signature, 'base64url'), mac(cloud.secret, body))) throw new Error('Invalid voice upload ticket.')
  const ticket: Ticket = JSON.parse(Buffer.from(body, 'base64url').toString())
  if (ticket.owner !== owner || now() - ticket.timestamp > 7200) throw new Error('The voice upload ticket expired.')
  return ticket
}

function signedVoiceUrl(cloud: Cloud, voice: VoiceAsset, compatible = false) {
  const converted = compatible && voice.format === 'ogg'
  const file = assetName(voice.id) + '.' + (converted ? 'mp3' : voice.format)
  const path = converted ? mp3Transform + '/' : ''
  const signature = createHash('sha256').update(path + file + cloud.secret).digest('base64url').slice(0, 8)
  return `https://res.cloudinary.com/${cloud.cloud}/video/authenticated/s--${signature}--/${path}v${voice.version}/${file}`
}

export class VoiceValidationError extends Error {}
const invalid = () => new VoiceValidationError('Choose a valid MP3, WAV or OGG audio-only recording up to 10 MB and five minutes.')

async function checkHeader(cloud: Cloud, voice: VoiceAsset, format: VoiceFormat, compatible = false) {
  const response = await fetch(signedVoiceUrl(cloud, voice, compatible), {
    headers: { Range: 'bytes=0-511', 'Accept-Encoding': 'identity' },
    cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(12_000),
  })
  const range = /^bytes 0-(\d+)\/(\d+)$/.exec(response.headers.get('content-range') ?? '')
  const mime = response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase()
  if (response.status !== 206 || !range || +range[1] > 511 || !mime ||
    !(voiceFormats[format] as readonly string[]).includes(mime)) {
    await response.body?.cancel()
    throw new Error('Voice byte-range delivery unavailable.')
  }
  const reader = response.body?.getReader()
  if (!reader) throw invalid()
  const body = new Uint8Array(+range[1] + 1)
  let offset = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (offset + value.byteLength > body.byteLength) throw invalid()
      body.set(value, offset)
      offset += value.byteLength
    }
  } finally { await reader.cancel().catch(() => {}) }
  if (offset !== body.length || !voiceHeader(body, format)) throw invalid()
  return Number(range[2])
}

export async function verifyVoice(cloud: Cloud, ticket: Ticket) {
  const id = assetName(ticket.id)
  const response = await fetch(`${endpoint(cloud)}/resources/video/authenticated/${id}?media_metadata=true`, {
    headers: { Authorization: 'Basic ' + Buffer.from(cloud.key + ':' + cloud.secret).toString('base64') },
    cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(12_000),
  })
  if (!response.ok) {
    await response.body?.cancel()
    throw new Error('Cloudinary has not confirmed the recording. Try saving it again shortly.')
  }
  const asset = await response.json()
  const duration = Number(asset.duration ?? asset.audio?.duration ?? asset.media_metadata?.duration)
  const created = Date.parse(asset.created_at) / 1000
  // Cloudinary's Admin API reports Ogg Opus as "opus" even though the upload API labels it "ogg".
  const format = ticket.format === 'ogg' && asset.format === 'opus' ? 'ogg' : asset.format
  if (asset.public_id !== id || asset.resource_type !== 'video' || asset.type !== 'authenticated' ||
    asset.placeholder || asset.access_control?.length || format !== ticket.format ||
    !Number.isSafeInteger(asset.bytes) || asset.bytes < 1 || asset.bytes > voiceByteLimit ||
    (ticket.format === 'ogg' && asset.bytes !== ticket.bytes) ||
    Number(asset.width ?? 0) !== 0 || Number(asset.height ?? 0) !== 0 || asset.video?.codec ||
    typeof asset.asset_id !== 'string' || !/^[a-f0-9]{32}$/i.test(asset.asset_id) ||
    !Number.isSafeInteger(asset.version) || asset.version < 1 || !Number.isFinite(created) ||
    created < ticket.timestamp - 60 || created > now() + 60 || !Number.isFinite(duration) || duration <= 0 || duration > voiceDurationLimit) {
    throw invalid()
  }
  const voice = { id: ticket.id, version: asset.version, format: ticket.format }
  if (await checkHeader(cloud, voice, ticket.format) !== asset.bytes) throw invalid()
  if (ticket.format === 'ogg') {
    if (!Array.isArray(asset.derived) || !asset.derived.some((item: { transformation?: string; format?: string }) =>
      item.format === 'mp3' && item.transformation === mp3Transform + '/mp3')) {
      throw new Error('Cloudinary has not prepared the private MP3 playback copy.')
    }
    await checkHeader(cloud, voice, 'mp3', true)
  }
  return { id: ticket.id, title: ticket.title, asset_id: asset.asset_id, format: ticket.format,
    bytes: asset.bytes as number, duration, version: asset.version, owner_id: ticket.owner }
}

export async function streamVoice(request: Request, cloud: Cloud, voice: VoiceAsset) {
  if (!uuidPattern.test(voice.id) || !Object.hasOwn(voiceFormats, voice.format) || !Number.isSafeInteger(voice.version)) {
    return new Response(null, { status: 404 })
  }
  const source = signedVoiceUrl(cloud, voice, true)
  const range = request.headers.get('range')
  if (range && !/^bytes=(?:\d{1,12}-\d{0,12}|-\d{1,12})$/.test(range)) {
    return new Response(null, { status: 416, headers: { 'Cache-Control': 'private, no-store' } })
  }
  try {
    const upstream = await fetch(source, { cache: 'no-store', redirect: 'error', signal: request.signal,
      headers: { 'Accept-Encoding': 'identity', ...(range ? { Range: range } : {}) } })
    const headers = new Headers({ 'Cache-Control': 'private, no-store, no-transform', 'X-Content-Type-Options': 'nosniff',
      'Content-Type': voice.format === 'wav' ? 'audio/wav' : 'audio/mpeg' })
    for (const name of ['content-range', 'content-length', 'accept-ranges']) {
      const value = upstream.headers.get(name)
      if (value) headers.set(name, value)
    }
    if (upstream.status === 200 || upstream.status === 206) return new Response(upstream.body, { status: upstream.status, headers })
    await upstream.body?.cancel()
    if (upstream.status === 416) {
      headers.delete('content-length')
      return new Response(null, { status: 416, headers })
    }
  } catch { /* Keep the provider URL and errors on the server. */ }
  return new Response(null, { status: 502, headers: { 'Cache-Control': 'no-store' } })
}
