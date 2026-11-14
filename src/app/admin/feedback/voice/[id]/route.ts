import { requireAdmin } from '../../../../../lib/admin-access'
import { uuidPattern } from '../../../../../domain/portfolio-cms'
import { cloudinaryConfig } from '../../../../../lib/media/cloudinary'
import { streamVoice } from '../../../../../lib/media/voice-notes'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase } = await requireAdmin()
  const { id } = await params
  const cloud = cloudinaryConfig()
  if (!uuidPattern.test(id) || !cloud) return new Response(null, { status: 404 })
  const { data } = await supabase.from('portfolio_voice_notes').select('id,format,version').eq('id', id).maybeSingle()
  return data ? streamVoice(request, cloud, data) : new Response(null, { status: 404 })
}
