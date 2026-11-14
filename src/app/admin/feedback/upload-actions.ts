'use server'

import { requireAdmin } from '../../../lib/admin-access'
import { cloudinaryConfig } from '../../../lib/media/cloudinary'
import { mediaTitle } from '../../../lib/media/formats'
import { signVoice, verifyVoice, VoiceValidationError, voiceTicket } from '../../../lib/media/voice-notes'
import { voiceFormat } from '../../../lib/media/voice-format'
import { mediaWriter } from '../../../lib/media/writer'

export async function signVoiceUpload(file: { name: string; size: number; mime: string; title: string }) {
  const { user } = await requireAdmin({ writable: true })
  const cloud = cloudinaryConfig()
  if (!cloud || !mediaWriter()) return { error: 'Voice uploads are unavailable.' }
  const format = voiceFormat(file)
  if (!format) return { error: 'Choose an MP3, WAV or OGG audio file up to 10 MB.' }
  try {
    return { upload: signVoice(cloud, { owner: user.id, format, bytes: file.size, title: mediaTitle(file.title) }) }
  } catch { return { error: 'Enter a valid recording filename.' } }
}

export async function saveVoiceUpload(token: string): Promise<{ id: string; duration: number } | { error: string }> {
  const { user } = await requireAdmin({ writable: true })
  const cloud = cloudinaryConfig()
  const writer = mediaWriter()
  if (!cloud || !writer) return { error: 'Voice uploads are unavailable.' }
  let ticket
  try { ticket = voiceTicket(cloud, token, user.id) }
  catch { return { error: 'The voice upload ticket is invalid or expired.' } }
  let asset
  try { asset = await verifyVoice(cloud, ticket) }
  catch (error) { return { error: error instanceof VoiceValidationError
    ? error.message : 'Cloudinary could not verify the recording or its private playback copy. Retry saving shortly.' } }
  const { user: current } = await requireAdmin({ writable: true })
  if (current.id !== user.id) return { error: 'The owner session changed.' }
  const { error } = await writer.from('portfolio_voice_notes').upsert(asset, { onConflict: 'id', ignoreDuplicates: true })
  return error ? { error: 'The recording could not be saved. Retry saving.' } : { id: asset.id, duration: asset.duration }
}
