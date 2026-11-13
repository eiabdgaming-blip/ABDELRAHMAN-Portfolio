import { requireAdmin } from '../../../../../lib/admin-access'
import { cloudinaryConfig, previewUrl } from '../../../../../lib/media/cloudinary'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase } = await requireAdmin()
  const { id } = await params
  if (!/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(id)) return new Response(null, { status: 404 })
  const cloud = cloudinaryConfig()
  if (!cloud) return new Response(null, { status: 503 })

  const { data, error } = await supabase.from('media_assets')
    .select('cloudinary_public_id,resource_type,format').eq('id', id).eq('delivery_type', 'authenticated').maybeSingle()
  if (error) return new Response(null, { status: 503 })
  if (!data) return new Response(null, { status: 404 })
  return new Response(null, {
    status: 307,
    headers: { Location: previewUrl(cloud, data), 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' },
  })
}
