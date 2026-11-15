import 'server-only'
import { cookies, headers } from 'next/headers'
import { adminCookieOptions, adminCookieSecure, adminSessionCookie, createAdminSessionClient } from './session'

export async function createSupabaseServerClient({ writable = false } = {}) {
  const [store, requestHeaders] = await Promise.all([cookies(), headers()])
  const secure = adminCookieSecure(requestHeaders)
  const supabase = createAdminSessionClient({
    getAll: () => store.getAll(),
    setAll: (updates) => {
      // For Server Components, the admin middleware refreshes cookies before rendering.
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
