import 'server-only'
import { createHmac } from 'node:crypto'
import { cloudinaryConfig, previewUrl } from './cloudinary'

type Cloud = NonNullable<ReturnType<typeof cloudinaryConfig>>
export type PublicationSource = {
  cloudinary_asset_id: string
  cloudinary_public_id: string
  resource_type: 'image' | 'video'
  format: string
  duration: number | null
}

const endpoint = (cloud: Cloud, path: string) => `https://api.cloudinary.com/v1_1/${cloud.cloud}/${path}`
const basicAuth = (cloud: Cloud) => 'Basic ' + Buffer.from(cloud.key + ':' + cloud.secret).toString('base64')
const publicId = (cloud: Cloud, source: PublicationSource) => 'abdel-web-v1-' +
  createHmac('sha256', cloud.secret).update(source.cloudinary_asset_id).digest('hex').slice(0, 32)

const posterTransform = (video: boolean, width: number) =>
  `${video ? 'so_50p/' : ''}c_limit,q_auto:good,w_${width}`

export async function queuePublicCopy(cloud: Cloud, source: PublicationSource) {
  const video = source.resource_type === 'video'
  const bitrate = Math.min(2200, Math.max(450, Math.floor(660_000 / (source.duration || 1)) - 128))
  const fields = new FormData()
  for (const [name, value] of Object.entries({
    file: previewUrl(cloud, source),
    public_id: publicId(cloud, source),
    type: 'upload',
    overwrite: 'false',
    async: 'true',
    eager_async: 'true',
    format: video ? 'mp4' : 'webp',
    transformation: video
      ? `br_${bitrate}k,c_limit,f_mp4,fl_force_strip,h_1280,vc_h264,w_1280`
      : 'c_limit,f_webp,fl_force_strip,h_1200,q_auto:good,w_1200',
    eager: video
      ? [360, 720].map((width) => posterTransform(true, width) + '/jpg').join('|')
      : posterTransform(false, 360) + '/webp',
  })) fields.set(name, value)
  const response = await fetch(endpoint(cloud, `${source.resource_type}/upload`), {
    method: 'POST', body: fields, headers: { Authorization: basicAuth(cloud) },
    cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(18_000),
  })
  await response.body?.cancel()
  if (!response.ok) throw new Error('Cloudinary could not queue the delivery copy.')
}

async function accessible(url: string, mime: string, range = false) {
  const response = await fetch(url, {
    method: range ? 'GET' : 'HEAD',
    headers: range ? { Range: 'bytes=0-1' } : {},
    cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(12_000),
  })
  await response.body?.cancel()
  return (range
    ? response.status === 206 && /^bytes 0-1\/[1-9]\d+$/.test(response.headers.get('content-range') ?? '')
    : response.status === 200) && response.headers.get('content-type')?.split(';')[0] === mime
}

export async function verifiedPublicCopy(cloud: Cloud, source: PublicationSource) {
  const id = publicId(cloud, source)
  const kind = source.resource_type
  const response = await fetch(endpoint(cloud, `resources/${kind}/upload/${id}`), {
    headers: { Authorization: basicAuth(cloud) },
    cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(12_000),
  })
  if (response.status === 404) { await response.body?.cancel(); return null }
  if (!response.ok) { await response.body?.cancel(); throw new Error('Cloudinary could not verify the delivery copy.') }
  const asset = await response.json()
  const video = kind === 'video'
  const format = video ? 'mp4' : 'webp'
  const limit = video ? 1280 : 1200
  const bounded = (n: number) => Number.isSafeInteger(n) && n > 0 && n <= limit
  if (asset.placeholder) return null
  if (asset.public_id !== id || asset.type !== 'upload' || asset.resource_type !== kind ||
    asset.format !== format || asset.access_control?.length ||
    !/^[0-9a-f]{32}$/i.test(asset.asset_id) || !Number.isSafeInteger(asset.version) || asset.version <= 0 ||
    !bounded(asset.width) || !bounded(asset.height)) {
    throw new Error('Cloudinary returned an unexpected public asset.')
  }
  const base = `https://res.cloudinary.com/${cloud.cloud}/${kind}/upload`
  const path = `v${asset.version}/${id}`
  const url = `${base}/${path}.${format}`
  const poster = video ? `${base}/${posterTransform(true, 720)}/${path}.jpg` : url
  const small = `${base}/${posterTransform(video, 360)}/${path}.${video ? 'jpg' : 'webp'}`
  const ready = await Promise.all([
    accessible(url, video ? 'video/mp4' : 'image/webp', video),
    video ? accessible(poster, 'image/jpeg') : true,
    accessible(small, video ? 'image/jpeg' : 'image/webp'),
  ])
  if (!ready.every(Boolean)) return null
  return {
    asset_id: asset.asset_id as string, public_id: id, url, poster, poster_small: small, format,
    width: asset.width as number, height: asset.height as number,
  }
}
