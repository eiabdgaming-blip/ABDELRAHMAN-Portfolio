import { createServerClient, type CookieMethodsServer } from '@supabase/ssr'
import { supabaseConfig } from './config'

export const adminSessionCookie = 'abdel-admin-session'
export const adminCookieOptions = { path: '/admin', httpOnly: true, sameSite: 'lax' } as const

export function adminCookieSecure(headers: Pick<Headers, 'get'>, protocol?: string) {
  // HTTP cookies are needed for the loopback preview only.
  const loopback = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i.test(headers.get('host') ?? '')
  return !loopback || protocol === 'https:' || headers.get('x-forwarded-proto') === 'https'
}

export function createAdminSessionClient(cookies: CookieMethodsServer, secure: boolean) {
  const readEnv = (name: string) => process.env[name]
  const config = supabaseConfig(readEnv('NEXT_PUBLIC_SUPABASE_URL'), readEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'))
  if (!config) return null
  return createServerClient(config.url, config.key, {
    cookies,
    cookieOptions: { ...adminCookieOptions, secure, name: adminSessionCookie },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) },
  })
}
