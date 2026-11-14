'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '../../../lib/admin-access'
import { leadStatuses, leadTokenPattern } from '../../../domain/leads'

export type LeadUpdate = { message: string; ok?: boolean }

export async function updateLead(id: string, updatedAt: string, _state: LeadUpdate, form: FormData): Promise<LeadUpdate> {
  const { supabase } = await requireAdmin({ writable: true })
  const status = form.get('status')
  const notes = form.get('notes')
  if (!leadTokenPattern.test(id) || typeof updatedAt !== 'string' || !Number.isFinite(Date.parse(updatedAt)) ||
    typeof status !== 'string' || !Object.hasOwn(leadStatuses, status) || typeof notes !== 'string' ||
    notes.length > 4000 || notes.includes('\0')) return { message: 'Choose a valid status and keep notes under 4,001 characters.' }
  const { data, error } = await supabase.from('contact_leads').update({ status, owner_notes: notes.trim() })
    .eq('id', id).eq('updated_at', updatedAt).select('id').maybeSingle()
  if (error || !data) return { message: 'The inquiry could not be updated. Reload the page and try again.' }
  revalidatePath('/admin')
  revalidatePath('/admin/leads')
  return { ok: true, message: 'Inquiry updated.' }
}
