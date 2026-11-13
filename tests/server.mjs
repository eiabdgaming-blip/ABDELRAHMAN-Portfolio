import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

export const root = new URL('../', import.meta.url)
const next = fileURLToPath(new URL('node_modules/next/dist/bin/next', root))

export async function startBuiltServer({ review = false } = {}) {
  await readFile(new URL('.next/BUILD_ID', root))
  const server = spawn(process.execPath, [next, 'start', '--hostname', '127.0.0.1', '--port', '0'], {
    cwd: root,
    env: { ...process.env, ABDEL_LOCAL_REVIEW: review ? '1' : '0', NEXT_TELEMETRY_DISABLED: '1', NO_COLOR: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const closed = once(server, 'close')
  const stop = async () => { server.kill(); await closed }
  let log = ''
  try {
    const origin = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Next.js did not start:\n${log}`)), 20_000)
      server.once('error', reject)
      server.once('exit', (code) => reject(new Error(`Next.js exited (${code}):\n${log}`)))
      server.stderr.on('data', (chunk) => { log += chunk })
      server.stdout.on('data', (chunk) => {
        log += chunk
        const url = log.match(/Local:\s+(http:\/\/127\.0\.0\.1:\d+)/)?.[1]
        if (url && log.includes('Ready')) { clearTimeout(timer); resolve(url) }
      })
      closed.then(() => clearTimeout(timer), () => clearTimeout(timer))
    })
    return { origin, stop }
  } catch (error) {
    await stop().catch(() => {})
    throw error
  }
}
