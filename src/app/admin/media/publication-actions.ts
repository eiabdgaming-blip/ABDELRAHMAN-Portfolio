'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '../../../lib/admin-access'
import { cloudinaryConfig } from '../../../lib/media/cloudinary'
import { mediaTitle } from '../../../lib/media/formats'
import { queuePublicCopy, verifiedPublicCopy } from '../../../lib/media/publication-delivery'
import { mediaWriter } from '../../../lib/media/writer'
import { workCategories } from '../../../domain/work-categories'

export type PublicationResult = { message: string; error?: boolean; preparing?: boolean }
const uuid = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i
const fail = (message: string) => ({ message, error: true })

export async function deleteMediaAsset(id: string, revision: number, form: FormData): Promise<PublicationResult> {
  const { user } = await requireAdmin({ writable: true })
  if (typeof id !== 'string' || !uuid.test(id) || !Number.isSafeInteger(revision) || revision < 0) return fail('Invalid media selection.')
  if (form.get('confirmed') !== 'yes') return fail('Confirm the deletion before applying it.')
  const writer = mediaWriter()
  if (!writer) return fail('Configure the server credentials to delete media records.')

  const { data, error } = await writer.rpc('delete_media_asset', { p_actor: user.id, p_id: id, p_revision: revision })
  if (error?.code === 'PGRST202' || error?.code === '42883') return fail('Media deletion requires the database migration.')
  if (error?.code === '42501') return fail('An active owner account is required to delete media.')
  if (error) return fail('The media record could not be deleted. Refresh the library and try again.')

  switch (data?.status) {
    case 'stale': return fail('This asset changed. Refresh the library and try again.')
    case 'published': return fail('Hide this asset from the website before deleting it.')
    case 'poster': return fail(`This asset is the poster for published video “${data.title}”. Change its poster or hide the video first.`)
    case 'project': return fail(`Published project “${data.title}” uses this asset. Remove it from the project or hide the project first.`)
    case 'feedback': return fail(`Published feedback from “${data.title}” uses this asset. Remove the reference or hide the feedback first.`)
    case 'missing':
    case 'deleted':
      revalidatePath('/admin/media')
      revalidatePath('/admin/projects')
      revalidatePath('/admin/feedback')
      revalidatePath('/admin')
      return { message: data.status === 'deleted' ? `“${data.title}” was removed from Media Library.` : 'This asset has already been removed.' }
    default: return fail('The media record could not be deleted. Refresh the library and try again.')
  }
}

export async function changePublication(id: string, revision: number, form: FormData): Promise<PublicationResult> {
  const { user, supabase } = await requireAdmin({ writable: true })
  const writer = mediaWriter()
  if (!writer) return fail('Configure the server credentials to manage publications.')
  if (typeof id !== 'string' || !uuid.test(id) || !Number.isSafeInteger(revision) || revision < 0) return fail('Invalid media selection.')
  const command = form.get('command')
  if ((command !== 'save' && command !== 'publish' && command !== 'hide') || form.get('confirmed') !== 'yes') {
    return fail('Confirm the change before applying it.')
  }
  const { data: source, error } = await supabase.from('media_assets')
    .select('cloudinary_asset_id,cloudinary_public_id,resource_type,format,duration,status,publication_revision')
    .eq('id', id).maybeSingle()
  if (error || !source) return fail('The media record could not be loaded.')
  const stale = () => fail('This item changed. Refresh the page and try again.')
  const rejection = (result: unknown) => {
    if (result === 'featured_limit') return fail('Apply the Home Reels database migration to publish more featured reels.')
    if (result === 'invalid_poster') return fail('Choose a published image or use the automatic poster.')
    return stale()
  }
  if (source.publication_revision !== revision) return stale()

  const args = { p_actor: user.id, p_id: id, p_revision: revision }
  const apply = async (p_command: string, extra: Record<string, unknown> = {}) =>
    writer.rpc('change_media_publication', { ...args, p_command, ...extra })
  const refresh = () => {
    revalidatePath('/admin/media')
    revalidatePath('/')
    revalidatePath('/work')
  }
  if (command === 'hide') {
    const result = await apply('hide')
    if (result.error) return fail('The media could not be hidden.')
    if (result.data !== 'saved') return stale()
    refresh()
    return { message: 'Hidden from the website.' }
  }

  const video = source.resource_type === 'video'
  const title = form.get('title')
  const placement = video ? form.get('placement') : 'work'
  const format = video ? form.get('project_format') : 'long-form'
  const featured = video && form.get('featured') === 'yes'
  const category = video ? form.get('category') : ''
  const description = video ? form.get('description') : ''
  const poster = video ? form.get('poster_asset_id') : ''
  const order = video ? form.get('display_order') : '0'
  if (typeof title !== 'string' || (placement !== 'home' && placement !== 'work' && placement !== 'both') ||
    (format !== 'reel' && format !== 'long-form') || (placement !== 'work' && format !== 'reel') ||
    (featured && placement === 'work') || (category !== '' && !workCategories.some(([key]) => key === category)) ||
    typeof description !== 'string' || description.length > 1000 || typeof poster !== 'string' || (poster && !uuid.test(poster)) ||
    typeof order !== 'string' || !/^\d{1,5}$/.test(order)) return fail('Check the display settings and try again.')
  if ((command === 'publish' || source.status === 'published') && placement === 'home' && !featured) {
    return fail('Mark this Home-only reel as featured or choose another placement.')
  }

  let safeTitle: string
  try { safeTitle = mediaTitle(title) } catch { return fail('Enter a title of 1–120 characters.') }
  const settings = {
    title: safeTitle, placement, project_format: format, featured, display_order: Number(order),
    category: category || null, description: description.trim() || null, poster_asset_id: poster || null,
  }

  let delivery
  if (command === 'publish') {
    if (source.status === 'published') return stale()
    const cloud = cloudinaryConfig()
    if (!cloud) return fail('Configure Cloudinary to publish media.')
    try {
      delivery = await verifiedPublicCopy(cloud, source)
      if (!delivery) {
        const queued = await apply('queue', { p_settings: settings })
        if (queued.error) return fail('The preparation state could not be saved.')
        if (queued.data === 'queued') await queuePublicCopy(cloud, source)
        else if (queued.data !== 'pending') return rejection(queued.data)
        return { preparing: true, message: 'Cloudinary is preparing the public copy. Wait a moment, then choose Check and publish.' }
      }
    } catch {
      return fail('Cloudinary could not prepare or verify the public copy. The item is still unpublished. Try again in a few minutes.')
    }
  }

  const result = await apply(command, { p_settings: settings, ...(delivery ? { p_delivery: delivery } : {}) })
  if (result.error) return fail('The publication change could not be saved.')
  if (result.data !== 'saved') return rejection(result.data)
  refresh()
  return { message: command === 'publish' ? 'Published.' : 'Display settings saved.' }
}
