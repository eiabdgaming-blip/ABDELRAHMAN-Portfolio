import { createReadStream } from 'node:fs'
import { realpath, stat } from 'node:fs/promises'
import { resolve, extname, relative, isAbsolute } from 'node:path'
import { Readable } from 'node:stream'
import { reviewAllowed, reviewFiles } from '../../../../server/review'

const contentTypes = { '.mp4': 'video/mp4', '.jpg': 'image/jpeg', '.png': 'image/png' }

async function serve(request: Request, context: { params: Promise<{ asset: string }> }) {
  const { asset } = await context.params
  const site = request.headers.get('sec-fetch-site')
  if (!reviewAllowed(request.headers.get('host')) || (site && site !== 'same-origin' && site !== 'none') ||
    !Object.hasOwn(reviewFiles, asset)) return new Response(null, { status: 404 })

  const root = await realpath(resolve(process.cwd(), '..', 'handoff', 'assets')).catch(() => null)
  if (!root) return new Response(null, { status: 404 })
  const path = await realpath(resolve(root, reviewFiles[asset as keyof typeof reviewFiles])).catch(() => null)
  if (!path) return new Response(null, { status: 404 })
  const inside = relative(root, path)
  if (!inside || inside.startsWith('..') || isAbsolute(inside)) return new Response(null, { status: 404 })
  const file = await stat(path).catch(() => null)
  if (!file?.isFile()) return new Response(null, { status: 404 })

  const headers = new Headers({
    'Content-Type': contentTypes[extname(path) as keyof typeof contentTypes],
    'Cache-Control': 'private, no-store',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'X-Content-Type-Options': 'nosniff',
    'Accept-Ranges': 'bytes',
  })
  const range = request.headers.get('range')
  let start = 0
  let end = file.size - 1
  if (range) {
    const parsed = /^bytes=(\d*)-(\d*)$/.exec(range)
    if (parsed?.[1]) {
      start = Number(parsed[1])
      if (parsed[2]) end = Math.min(end, Number(parsed[2]))
    } else if (parsed?.[2] && Number(parsed[2]) > 0) {
      start = Math.max(0, file.size - Number(parsed[2]))
    } else {
      start = file.size
    }
    if (!Number.isSafeInteger(start) || start > end) {
      headers.set('Content-Range', `bytes */${file.size}`)
      return new Response(null, { status: 416, headers })
    }
    headers.set('Content-Range', `bytes ${start}-${end}/${file.size}`)
  }
  headers.set('Content-Length', String(end - start + 1))
  const body = request.method === 'HEAD' ? null
    : Readable.toWeb(createReadStream(path, { start, end, signal: request.signal })) as ReadableStream<Uint8Array>
  return new Response(body, { status: range ? 206 : 200, headers })
}

export const GET = serve
export const HEAD = serve
