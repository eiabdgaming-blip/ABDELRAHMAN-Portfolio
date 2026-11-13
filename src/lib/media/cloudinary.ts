import 'server-only'
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { byteLimits, formats, maxImagePixels, type Format } from './formats'

const api = 'https://api.cloudinary.com/v1_1'
const delivery = 'https://res.cloudinary.com'
const now = () => Math.floor(Date.now() / 1000)

export function cloudinaryConfig() {
  const { CLOUDINARY_CLOUD_NAME: cloud, CLOUDINARY_API_KEY: key, CLOUDINARY_API_SECRET: secret } = process.env
  return cloud && /^[a-z0-9_-]+$/i.test(cloud) && key && secret ? { cloud, key, secret } : null
}

type Cloud = NonNullable<ReturnType<typeof cloudinaryConfig>>
type Ticket = { owner: string; id: string; format: Format; bytes: number; title: string; issued: number }

function sign(params: Record<string, string>, secret: string) {
  const input = Object.keys(params).sort().map((key) => `${key}=${params[key]}`).join('&')
  return createHash('sha256').update(input + secret).digest('hex')
}

function ticketMac(body: string, secret: string) {
  return createHmac('sha256', secret).update('abdel-media-v1:' + body).digest()
}

function publicId(id: string) {
  return 'abdel-media-' + id
}

export function issueUpload(cloud: Cloud, request: Omit<Ticket, 'id' | 'issued'>) {
  const ticket: Ticket = { ...request, id: randomUUID(), issued: now() }
  const body = Buffer.from(JSON.stringify(ticket)).toString('base64url')
  const resource = formats[ticket.format].resource
  const fields = {
    allowed_formats: ticket.format === 'jpg' ? 'jpg,jpeg' : ticket.format,
    overwrite: 'false',
    public_id: publicId(ticket.id),
    timestamp: String(ticket.issued),
    type: 'authenticated',
  }
  return {
    ticket: body + '.' + ticketMac(body, cloud.secret).toString('base64url'),
    url: `${api}/${cloud.cloud}/${resource}/upload`,
    fields: { ...fields, api_key: cloud.key, signature: sign(fields, cloud.secret) },
  }
}

export function readTicket(cloud: Cloud, value: string, owner: string) {
  if (value.length > 1800 || !/^[\w-]+\.[\w-]{43}$/.test(value)) throw new Error('Invalid upload ticket.')
  const [body, signature] = value.split('.')
  const mac = Buffer.from(signature, 'base64url')
  if (mac.length !== 32 || !timingSafeEqual(mac, ticketMac(body, cloud.secret))) throw new Error('Invalid upload ticket.')
  const ticket: Ticket = JSON.parse(Buffer.from(body, 'base64url').toString())
  if (ticket.owner !== owner || now() - ticket.issued > 7200) throw new Error('This upload ticket has expired or belongs to another session.')
  return ticket
}

export class MediaVerificationError extends Error {}

export async function verifyUpload(cloud: Cloud, ticket: Ticket) {
  const resource = formats[ticket.format].resource
  const id = publicId(ticket.id)
  const video = resource === 'video'
  const response = await fetch(`${api}/${cloud.cloud}/resources/${resource}/authenticated/${id}${video ? '?media_metadata=true' : ''}`, {
    headers: { Authorization: 'Basic ' + Buffer.from(cloud.key + ':' + cloud.secret).toString('base64') },
    cache: 'no-store',
    signal: AbortSignal.timeout(12_000),
  })
  if (response.status === 404) throw new MediaVerificationError('Cloudinary has not confirmed this upload. Retry saving shortly.')
  if (!response.ok) throw new Error('Cloudinary verification failed.')

  const asset = await response.json()
  const format = asset.format === 'jpeg' ? 'jpg' : asset.format
  const duration = asset.duration ?? asset.media_metadata?.duration
  const dimension = (value: number) => Number.isSafeInteger(value) && value > 0 && value <= 100_000
  const created = Date.parse(asset.created_at) / 1000
  if (asset.public_id !== id || asset.resource_type !== resource || asset.type !== 'authenticated' ||
    asset.placeholder || asset.access_control?.length || format !== ticket.format ||
    typeof asset.asset_id !== 'string' || !/^[\da-f]{32}$/i.test(asset.asset_id) ||
    asset.bytes !== ticket.bytes || asset.bytes < 1 || asset.bytes > byteLimits[resource] ||
    !dimension(asset.width) || !dimension(asset.height) ||
    (!video && asset.width * asset.height > maxImagePixels) ||
    (video && (!Number.isFinite(duration) || duration <= 0)) ||
    !Number.isFinite(created) || created < ticket.issued - 60 || created > now() + 60 ||
    !Number.isSafeInteger(asset.version) || asset.version < 1) {
    throw new MediaVerificationError('The uploaded asset did not match the verified file requirements. It was not added to the library.')
  }

  return {
    id: ticket.id, title: ticket.title, cloudinary_asset_id: asset.asset_id as string,
    cloudinary_public_id: id, resource_type: resource, delivery_type: 'authenticated',
    secure_url: `${delivery}/${cloud.cloud}/${resource}/authenticated/v${asset.version}/${id}.${asset.format}`,
    format: ticket.format, bytes: ticket.bytes, width: asset.width as number, height: asset.height as number,
    duration: video ? duration as number : null,
    metadata: { version: asset.version as number, cloudinary_created_at: new Date(created * 1000).toISOString() },
  }
}

export function previewUrl(cloud: Cloud, asset: { cloudinary_public_id: string; resource_type: string; format: string }) {
  const params = {
    attachment: 'false',
    expires_at: String(now() + 600),
    format: asset.format,
    public_id: asset.cloudinary_public_id,
    timestamp: String(now()),
    type: 'authenticated',
  }
  return `${api}/${cloud.cloud}/${asset.resource_type}/download?${new URLSearchParams({
    ...params, api_key: cloud.key, signature: sign(params, cloud.secret),
  })}`
}
