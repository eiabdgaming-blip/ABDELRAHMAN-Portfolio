import 'server-only'
import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from './supabase/server'

export async function isActiveOwner(supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>['supabase']>, userId: string) {
  const { data, error } = await supabase.from('owner_members')
    .select('auth_user_id')
    .eq('auth_user_id', userId).eq('role', 'owner').eq('status', 'active')
    .maybeSingle()
  if (error) throw new Error('Owner membership could not be checked.')
  return data !== null
}

export async function requireAdmin({ writable = false } = {}) {
  const session = await createSupabaseServerClient({ writable })
  const { supabase } = session
  if (!supabase) redirect('/admin/login?error=unavailable')

  const { data: { user }, error } = await supabase.auth.getUser().catch(() => ({
    data: { user: null }, error: { status: 503 },
  }))
  if (error && (!error.status || error.status >= 500)) redirect('/admin/login?error=unavailable')
  if (error || !user) redirect('/admin/login')

  const authorized = await isActiveOwner(supabase, user.id).catch(() => null)
  if (authorized === null) redirect('/admin/login?error=unavailable')
  if (!authorized) redirect('/admin/login?error=denied')
  return { ...session, supabase, user }
}
