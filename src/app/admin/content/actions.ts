'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '../../../lib/admin-access'
import { contactValue, contentText, siteFields, type SiteField } from '../../../domain/site-content'

export type ContentResult = { message: string; ok?: boolean }

export async function saveContent(section: string, id: string | null, _state: ContentResult, form: FormData): Promise<ContentResult> {
  const { supabase } = await requireAdmin({ writable: true })
  const intent = form.get('intent') ?? 'save'
  const invalid = { message: 'Check the required fields and display order.' }
  const failure = { message: 'The change could not be saved. Refresh the page and try again.' }
  if (intent !== 'save' && intent !== 'delete') return invalid
  if (section === 'settings') {
    if (id !== null || intent !== 'save') return invalid
    const fields = {} as Record<SiteField, string>
    for (const field of Object.keys(siteFields) as SiteField[]) {
      const value = contactValue(field, form.get(field))
      if (!value) return { message: `Enter a valid ${siteFields[field].label.toLowerCase()}.` }
      fields[field] = value
    }
    const { data, error } = await supabase.from('site_contact').update(fields).eq('id', true).select('id').maybeSingle()
    if (error || !data) return failure
  } else {
    if (section !== 'services' && section !== 'faq') return invalid
    const service = section === 'services'
    const table = service ? 'site_services' : 'site_faq'
    const validId = service ? /^[a-z0-9]+(?:-[a-z0-9]+)*$/ : /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/
    if (id !== null && (typeof id !== 'string' || id.length > 80 || !validId.test(id))) return invalid
    if (intent === 'delete') {
      if (service || !id || form.get('confirmDelete') !== 'yes') return { message: 'Confirm deletion before continuing.' }
      const { data, error } = await supabase.from(table).delete().eq('id', id).select('id').maybeSingle()
      if (error || !data) return failure
    } else {
      const title = contentText(form.get('title'), service ? 120 : 200)
      const text = contentText(form.get('text'), service ? 1000 : 2000)
      const order = form.get('order')
      const status = form.get('public')
      if (!title || !text || typeof order !== 'string' || !/^\d{1,5}$/.test(order) || (status !== 'yes' && status !== 'no')) return invalid
      const display_order = Number(order)
      const changes: Record<string, string | number | boolean> = service ? { title, description: text, display_order, visible: status === 'yes' }
        : { question: title, answer: text, display_order, published: status === 'yes' }
      const query = supabase.from(table)
      const { data, error } = await (id ? query.update(changes).eq('id', id) : query.insert(changes)).select('id').maybeSingle()
      if (error || !data) return failure
    }
  }
  revalidatePath('/')
  revalidatePath('/admin/content/' + section)
  return { ok: true, message: intent === 'delete' ? 'Question deleted.' : 'Changes saved.' }
}
