import 'server-only'
import { cookies, headers } from 'next/headers'
import { adminCookieOptions, adminSessionCookie, createAdminSessionClient } from './session'

export async function createSupabaseServerClient({ writable = false } = {}) {
  const [store, requestHeaders] = await Promise.all([cookies(), headers()])
  // The local preview runs on HTTP loopback. HTTPS requests use Secure cookies.
  const local = /^(127\.0\.0\.1|localhost)(:\d+)?$/.test(requestHeaders.get('host') ?? '')
  const secure = !local || requestHeaders.get('x-forwarded-proto') === 'https'
  const supabase = createAdminSessionClient({
    getAll: () => store.getAll(),
    setAll: (updates) => {
      // For Server Components, the admin Proxy refreshes cookies before rendering.
      if (writable) for (const { name, value, options } of updates) store.set(name, value, options)
    },
  }, secure)

  return {
    supabase,
    clearSession() {
      for (const { name } of store.getAll()) {
        if (name === adminSessionCookie || name.startsWith(adminSessionCookie + '.')) {
          store.set(name, '', { ...adminCookieOptions, secure, maxAge: 0 })
        }
      }
    },
  }
}
