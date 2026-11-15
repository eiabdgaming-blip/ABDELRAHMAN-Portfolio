import 'server-only'
import { createHmac } from 'node:crypto'
import { cloudinaryConfig, previewUrl } from './cloudinary'

type Cloud = NonNullable<ReturnType<typeof cloudinaryConfig>>
export type FeedbackImage = { id: string; resource_type: 'image'; cloudinary_public_id: string; format: string }

export async function prepareFeedbackImage(cloud: Cloud, image: FeedbackImage, slot: 'avatar' | 'proof') {
  const id = 'abdel-feedback-' + createHmac('sha256', cloud.secret).update(slot + ':' + image.id).digest('hex').slice(0, 32)
  const api = `https://api.cloudinary.com/v1_1/${cloud.cloud}`
  const headers = { Authorization: 'Basic ' + Buffer.from(cloud.key + ':' + cloud.secret).toString('base64') }
  const config = { headers, cache: 'no-store', redirect: 'manual', signal: AbortSignal.timeout(18_000) } as const
  let response = await fetch(`${api}/resources/image/upload/${id}`, config)
  if (response.status === 404) {
    await response.body?.cancel()
    const size = slot === 'avatar' ? 240 : 1000
    const body = new FormData()
    for (const [key, value] of Object.entries({
      file: previewUrl(cloud, image), public_id: id, overwrite: 'false', type: 'upload', format: 'webp',
      transformation: `c_limit,f_webp,fl_force_strip,h_${size},q_auto:good,w_${size}`,
    })) body.set(key, value)
    response = await fetch(api + '/image/upload', { ...config, body, method: 'POST' })
  }
  if (!response.ok) {
    await response.body?.cancel()
    throw new Error('Cloudinary could not prepare the feedback image.')
  }
  const output = await response.json()
  const limit = slot === 'avatar' ? 240 : 1000
  if (output.public_id !== id || output.resource_type !== 'image' || output.type !== 'upload' || output.format !== 'webp' ||
    output.placeholder || output.access_control?.length || !Number.isSafeInteger(output.version) || output.version < 1 ||
    ![output.width, output.height].every((n) => Number.isSafeInteger(n) && n > 0 && n <= limit)) {
    throw new Error('Cloudinary returned an unexpected feedback image.')
  }
  const url = `https://res.cloudinary.com/${cloud.cloud}/image/upload/v${output.version}/${id}.webp`
  const ready = await fetch(url, { method: 'HEAD', cache: 'no-store', redirect: 'manual', signal: AbortSignal.timeout(10_000) })
  if (!ready.ok || ready.headers.get('content-type')?.split(';')[0] !== 'image/webp') {
    throw new Error('The optimized image is still unavailable.')
  }
  return url
}
