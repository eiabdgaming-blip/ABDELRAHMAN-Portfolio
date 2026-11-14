'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '../../lib/admin-access'
import { mediaWriter } from '../../lib/media/writer'
import { profilePattern, profileFields, profileKeys, slugPattern, studyFields, uuidPattern } from '../../domain/portfolio-cms'
import { cloudinaryConfig } from '../../lib/media/cloudinary'
import { prepareFeedbackImage } from '../../lib/media/feedback-images'
import { workCategories } from '../../domain/work-categories'

export type PortfolioResult = { message: string; ok?: boolean; id?: string }

export async function savePortfolio(kind: 'project' | 'feedback', id: string | null, revision: number,
  _previous: PortfolioResult, form: FormData): Promise<PortfolioResult> {
  const { user, supabase } = await requireAdmin({ writable: true })
  const writer = mediaWriter()
  if (!writer) return { message: 'Configure the existing media server credential to save changes.' }
  if ((kind !== 'project' && kind !== 'feedback') || (id !== null && !uuidPattern.test(id)) ||
      !Number.isSafeInteger(revision) || revision < 0) return { message: 'Invalid entry.' }
  const read = (name: string, max: number, required = false) => {
    const value = form.get(name) ?? ''
    if (typeof value !== 'string' || value.length > max || value.includes('\0') || (required && !value.trim())) throw new Error()
    return value.trim()
  }
  const asset = (name: string) => {
    const value = read(name, 36)
    if (value && !uuidPattern.test(value)) throw new Error()
    return value || null
  }
  const order = (value: unknown) => {
    if (typeof value !== 'string' || !/^\d{1,5}$/.test(value)) throw new Error()
    return Number(value)
  }
  let command: string = kind
  let payload: Record<string, unknown> = {}
  try {
    if (form.get('intent') === 'delete') {
      if (kind !== 'feedback' || !id || form.get('confirm_delete') !== 'yes') return { message: 'Confirm deletion first.' }
      command = 'delete-feedback'
    } else {
      const status = read('status', 10)
      if (!['draft', 'published', 'hidden'].includes(status)) throw new Error()
      payload = { status, display_order: order(form.get('display_order')), featured: form.get('featured') === 'yes' }
      if (kind === 'project') {
        const slug = read('slug', 80, true)
        const category = read('category', 20)
        const project_format = read('project_format', 10)
        const presentation = read('presentation', 12)
        const ids = form.getAll('media_id')
        const orders = form.getAll('media_order')
        if (!slugPattern.test(slug) || (category && !workCategories.some(([key]) => key === category)) ||
          !['reel', 'long-form'].includes(project_format) || !['player', 'case-study'].includes(presentation) ||
          ids.length > 24 || ids.length !== orders.length) throw new Error()
        const media = ids.flatMap((value, i) => {
          if (value === '') return []
          if (typeof value !== 'string' || !uuidPattern.test(value)) throw new Error()
          return [{ id: value, order: order(orders[i]) }]
        })
        if (new Set(media.map(({ id }) => id)).size !== media.length) return { message: 'Select each media asset only once.' }
        const study = Object.fromEntries(Object.keys(studyFields).map((key) => [key, read(key, 4000)]))
        if (status === 'published' && (!media.length || (presentation === 'case-study' && !Object.values(study).some(Boolean)))) {
          return { message: 'Add published media and fill in at least one case study field when using Case Study.' }
        }
        Object.assign(payload, { slug, title: read('title', 120, true), description: read('description', 2000),
          category: category || null, project_format, presentation, cover_id: asset('cover_id'), media,
          study: Object.values(study).some(Boolean) ? study : null })
      } else {
        for (const key of profileKeys) {
          const profile = read(key, 240)
          const host = profileFields[key].toLowerCase() + '.com'
          if (profile && (!profilePattern.test(profile) || new URL(profile).hostname.replace(/^www\./, '') !== host)) {
            return { message: `Use a valid HTTPS ${profileFields[key]} profile URL.` }
          }
          payload[key] = profile || null
        }
        const proof_id = asset('proof_id')
        const proof_approved = !!proof_id && form.get('proof_approved') === 'yes'
        if (status === 'published' && proof_id && !proof_approved) return { message: 'Approve the redacted proof screenshot before publishing.' }
        const voice_id = asset('voice_id')
        const voice_approved = !!voice_id && form.get('voice_approved') === 'yes'
        if (status === 'published' && voice_id && !voice_approved) return { message: 'Approve the recording before publishing.' }
        const services = [...new Set(form.getAll('services'))]
        if (services.length > 24 || services.some((value) => typeof value !== 'string' || value.length > 80 || !slugPattern.test(value))) throw new Error()
        Object.assign(payload, { client_name: read('client_name', 120, true), affiliation: read('affiliation', 160),
          profile_url: null, quote: read('quote', 3000, true), avatar_id: asset('avatar_id'), proof_id,
          proof_approved, voice_id, voice_approved, project_id: asset('project_id'), work_asset_id: asset('work_asset_id'), services })
        if (payload.project_id && payload.work_asset_id) return { message: 'Choose one work reference.' }
      }
    }
  } catch { return { message: 'Check the fields, slug and display order.' } }

  if (command === 'feedback' && payload.status === 'published') {
    const attachments: Record<string, string> = {}
    const cloud = cloudinaryConfig()
    try {
      for (const slot of ['avatar', 'proof'] as const) {
        const sourceId = payload[slot + '_id']
        if (!sourceId) continue
        const { data } = await supabase.from('media_assets').select('id,status,resource_type,cloudinary_public_id,format')
          .eq('id', sourceId).eq('resource_type', 'image').maybeSingle()
        if (!data || data.status === 'hidden') return { message: 'Select an available image for the photo or proof.' }
        if (data.status === 'published') continue
        if (!cloud) return { message: 'Cloudinary is unavailable for feedback images.' }
        attachments[slot] = await prepareFeedbackImage(cloud, { ...data, resource_type: 'image' }, slot)
      }
    } catch { return { message: 'Cloudinary could not prepare the selected photo or proof. Try again shortly.' } }
    payload.attachment_public = attachments
  }
  const args = { p_actor: user.id, p_id: id, p_revision: revision, p_payload: payload }
  const { data, error } = command === 'feedback' ? await writer.rpc('save_feedback_attachments', args)
    : await writer.rpc('save_portfolio_entry', { ...args, p_kind: command })
  if (error?.code === '23505') return { message: 'That project slug is already in use.' }
  if (error?.code === '23514' || error?.code === '23503') return { message: 'Check the selected media and work references. Publish the required assets in Media Library first.' }
  if (error || !data) return { message: 'Could not save this entry. Refresh and check for changes.' }
  revalidatePath('/')
  revalidatePath('/work')
  revalidatePath('/work/[slug]', 'page')
  revalidatePath(kind === 'project' ? '/admin/projects' : '/admin/feedback')
  return { message: command === 'delete-feedback' ? 'Feedback deleted.' : 'Changes saved.', ok: true, id: data }
}
