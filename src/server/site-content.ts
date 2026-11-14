import 'server-only'
import { ownerContact } from '../domain/contact'
import { questions, services } from '../domain/editorial'
import type { Service } from '../domain/site-content'
import { createPublicSupabaseClient } from '../lib/supabase/public'

export async function publicSiteContent(review: boolean) {
  const fallbackQuestions = (review ? questions : questions.slice(0, 1)).map(([question, answer], index) =>
    ({ id: String(index), question, answer }))
  const supabase = createPublicSupabaseClient()
  const [serviceResult, faqResult, contactResult] = supabase ? await Promise.all([
    supabase.from('site_services').select('id,title,description').eq('visible', true).order('display_order').order('id'),
    supabase.from('site_faq').select('id,question,answer').eq('published', true).order('display_order').order('id'),
    supabase.from('site_contact').select('email,whatsapp,instagram,tiktok').eq('id', true).maybeSingle(),
  ]) : []
  const missing = (error?: { code: string } | null) => error?.code === 'PGRST205' || error?.code === '42P01'
  return {
    services: !serviceResult || missing(serviceResult.error)
      ? services : (serviceResult.data ?? []).map(({ id, title, description }): Service => [id, title, description]),
    questions: !faqResult || missing(faqResult.error) ? fallbackQuestions : faqResult.data ?? [],
    contact: contactResult?.data ?? ownerContact,
  }
}
