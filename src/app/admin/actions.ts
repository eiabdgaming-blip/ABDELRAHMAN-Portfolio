'use server'

import { redirect } from 'next/navigation'
import { isActiveOwner, requireAdmin } from '../../lib/admin-access'
import { createSupabaseServerClient } from '../../lib/supabase/server'

export async function signIn(form: FormData) {
  const email = form.get('email')
  const password = form.get('password')
  if (typeof email !== 'string' || !email.trim() || email.length > 254 ||
    typeof password !== 'string' || !password || password.length > 4096) {
    redirect('/admin/login?error=credentials')
  }

  const { supabase, clearSession } = await createSupabaseServerClient({ writable: true })
  if (!supabase) redirect('/admin/login?error=unavailable')

  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password }).catch(() => ({
    data: { user: null }, error: { status: 503 },
  }))
  if (error?.status === 429) redirect('/admin/login?error=rate')
  if (error && (!error.status || error.status >= 500)) redirect('/admin/login?error=unavailable')
  if (error || !data.user) redirect('/admin/login?error=credentials')

  const authorized = await isActiveOwner(supabase, data.user.id).catch(() => null)
  if (!authorized) {
    await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined)
    clearSession()
    redirect(authorized === null ? '/admin/login?error=unavailable' : '/admin/login?error=denied')
  }
  redirect('/admin')
}

export async function signOut() {
  const { supabase, clearSession } = await requireAdmin({ writable: true })
  const result = await supabase.auth.signOut({ scope: 'local' }).catch(() => null)
  clearSession()
  redirect(result && !result.error ? '/admin/login' : '/admin/login?error=logout')
}
