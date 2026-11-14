import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { supabaseConfig } from './config'

const readEnv = (name: string) => process.env[name]

export function createPublicSupabaseClient() {
  const config = supabaseConfig(readEnv('NEXT_PUBLIC_SUPABASE_URL'), readEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'))
  if (!config) return null
  return createClient(config.url, config.key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store', signal: AbortSignal.timeout(5000) }) },
  })
}
