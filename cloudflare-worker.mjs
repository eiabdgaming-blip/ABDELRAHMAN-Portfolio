import openNext from './.open-next/worker.js'

const publicVideo = /^\/(videos|visuals)\/[^/]+\.mp4$/

function sliceStream(body, start, end) {
  const reader = body.getReader()
  let offset = 0
  return new ReadableStream({
    async pull(controller) {
      for (;;) {
        const { value, done } = await reader.read()
        if (done) throw new Error('Static video ended before the requested byte range')
        const next = offset + value.byteLength
        if (next > start) controller.enqueue(value.subarray(Math.max(0, start - offset), end + 1 - offset))
        offset = next
        if (next > end) {
          controller.close()
          await reader.cancel()
          return
        }
        if (next > start) return
      }
    },
    cancel: (reason) => reader.cancel(reason),
  }).pipeThrough(new FixedLengthStream(end - start + 1))
}

async function serveVideo(request, env, ctx) {
  const headers = new Headers(request.headers)
  const range = request.method === 'GET' ? /^bytes=(\d*)-(\d*)$/i.exec(headers.get('range') ?? '') : null
  headers.delete('range')
  headers.delete('if-range')
  headers.set('accept-encoding', 'identity')
  const response = await openNext.fetch(new Request(request, { headers }), env, ctx)
  if (response.status !== 200) return response

  const resultHeaders = new Headers(response.headers)
  resultHeaders.set('accept-ranges', 'bytes')
  const ifRange = request.headers.get('if-range')
  const matches = !ifRange || [resultHeaders.get('etag'), resultHeaders.get('last-modified')].includes(ifRange)
  if (!range || (!range[1] && !range[2]) || !matches || !response.body) {
    return new Response(response.body, { headers: resultHeaders })
  }

  // The asset binding may omit Content-Length. Bound the fallback to one static asset.
  const contentLength = resultHeaders.get('content-length')
  const bytes = contentLength === null ? new Uint8Array(await response.arrayBuffer()) : null
  const size = bytes?.byteLength ?? Number(contentLength)
  const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]))
  const end = range[1] && range[2] ? Math.min(size - 1, Number(range[2])) : size - 1
  if (start > end) {
    if (!bytes) await response.body.cancel()
    resultHeaders.set('content-range', `bytes */${size}`)
    resultHeaders.delete('content-length')
    return new Response(null, { status: 416, headers: resultHeaders })
  }

  resultHeaders.set('content-range', `bytes ${start}-${end}/${size}`)
  resultHeaders.set('content-length', String(end - start + 1))
  const body = bytes ? bytes.subarray(start, end + 1) : sliceStream(response.body, start, end)
  return new Response(body, { status: 206, headers: resultHeaders })
}

export default {
  fetch(request, env, ctx) {
    if ((request.method === 'GET' || request.method === 'HEAD') && publicVideo.test(new URL(request.url).pathname)) {
      return serveVideo(request, env, ctx)
    }
    return openNext.fetch(request, env, ctx)
  },
}
