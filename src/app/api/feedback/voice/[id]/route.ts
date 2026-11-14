import { uuidPattern } from '../../../../../domain/portfolio-cms'
import { cloudinaryConfig } from '../../../../../lib/media/cloudinary'
import { streamVoice, type VoiceAsset } from '../../../../../lib/media/voice-notes'
import { mediaWriter } from '../../../../../lib/media/writer'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const cloud = cloudinaryConfig()
  const db = mediaWriter()
  const missing = () => new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } })
  if (!uuidPattern.test(id) || !cloud || !db) return missing()
  const { data } = await db.from('portfolio_feedback').select('voice:portfolio_voice_notes(id,format,version)')
    .eq('id', id).eq('status', 'published').eq('voice_approved', true).maybeSingle()
  const voice = data?.voice as unknown as VoiceAsset | null | undefined
  return voice ? streamVoice(request, cloud, voice) : missing()
}
