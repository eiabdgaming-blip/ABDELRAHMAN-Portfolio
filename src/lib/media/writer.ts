import 'server-only'
import { createClient } from '@supabase/supabase-js'

const readEnv = (name: string) => process.env[name]

export function mediaWriter() {
  const url = readEnv('NEXT_PUBLIC_SUPABASE_URL')
  const key = process.env.SUPABASE_MEDIA_SECRET_KEY
  if (!url || !key?.startsWith('sb_secret_')) return null
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) },
  })
}
