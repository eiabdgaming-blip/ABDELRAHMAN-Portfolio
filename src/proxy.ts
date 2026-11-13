import { NextResponse, type NextRequest } from 'next/server'
import { adminSessionCookie, createAdminSessionClient } from './lib/supabase/session'

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })
  // Server Actions write their own cookies, including sign-in and sign-out changes.
  if (request.method === 'GET' && request.cookies.getAll().some(({ name }) =>
    name === adminSessionCookie || name.startsWith(adminSessionCookie + '.'))) {
    const supabase = createAdminSessionClient({
      getAll: () => request.cookies.getAll(),
      setAll: (updates, headers) => {
        for (const { name, value } of updates) request.cookies.set(name, value)
        const refreshed = NextResponse.next({ request })
        for (const cookie of response.cookies.getAll()) refreshed.cookies.set(cookie)
        for (const { name, value, options } of updates) refreshed.cookies.set(name, value, options)
        for (const [key, value] of Object.entries(headers)) refreshed.headers.set(key, value)
        response = refreshed
      },
    }, request.nextUrl.protocol === 'https:')
    // The page/action guard owns access decisions and handles provider failures.
    await supabase?.auth.getClaims().catch(() => undefined)
  }
  response.headers.set('Cache-Control', 'private, no-store')
  response.headers.set('X-Robots-Tag', 'noindex, nofollow')
  return response
}

export const config = { matcher: '/admin/:path*' }
