'use server'

import { requireAdmin } from '../../../lib/admin-access'
import { cloudinaryConfig, issueUpload, readTicket, verifyUpload, MediaVerificationError } from '../../../lib/media/cloudinary'
import { mediaTitle, validateFile } from '../../../lib/media/formats'
import { mediaWriter } from '../../../lib/media/writer'

export async function signUpload(input: { name: string; size: number; mime: string; title: string }) {
  const { user } = await requireAdmin({ writable: true })
  const cloud = cloudinaryConfig()
  if (!cloud || !mediaWriter()) return { error: 'Media uploads are not configured on the server.' }
  if (!input || typeof input.name !== 'string' || input.name.length > 255 ||
    typeof input.mime !== 'string' || typeof input.title !== 'string') return { error: 'Choose a file and enter a title.' }
  try {
    const format = validateFile(input.name, input.size, input.mime)
    return { upload: issueUpload(cloud, { owner: user.id, format, bytes: input.size, title: mediaTitle(input.title) }) }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Invalid file.' }
  }
}

export async function saveUpload(token: string): Promise<{ saved: true } | { error: string }> {
  const { user } = await requireAdmin({ writable: true })
  const cloud = cloudinaryConfig()
  const writer = mediaWriter()
  if (!cloud || !writer) return { error: 'Media uploads are not configured on the server.' }

  let ticket
  try {
    if (typeof token !== 'string') return { error: 'Invalid upload ticket.' }
    ticket = readTicket(cloud, token, user.id)
  } catch {
    return { error: 'The upload ticket is invalid or expired.' }
  }

  let asset
  try {
    asset = await verifyUpload(cloud, ticket)
  } catch (error) {
    return { error: error instanceof MediaVerificationError ? error.message : 'Cloudinary verification is unavailable. Retry saving.' }
  }

  const { user: activeUser } = await requireAdmin({ writable: true })
  if (activeUser.id !== user.id) return { error: 'The admin session changed. Sign in again to continue.' }

  try {
    const { error } = await writer.from('media_assets').upsert({
      ...asset, owner_id: user.id, status: 'draft',
    }, { onConflict: 'id', ignoreDuplicates: true })
    if (!error) return { saved: true }
  } catch {
    // The same ticket can retry the insert without creating another Cloudinary asset.
  }
  return { error: 'The file reached Cloudinary but could not be saved. Retry saving.' }
}
