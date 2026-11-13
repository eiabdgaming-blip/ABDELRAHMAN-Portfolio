'use client'

import { createClient } from '@supabase/supabase-js'
import { supabaseConfig } from './config'

// Admin sign-in uses server actions and HttpOnly cookies. Browser clients carry no admin session.
export function createSupabaseBrowserClient() {
  const config = supabaseConfig(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  )
  if (!config) throw new Error('Supabase public configuration is unavailable.')
  return createClient(config.url, config.key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}
