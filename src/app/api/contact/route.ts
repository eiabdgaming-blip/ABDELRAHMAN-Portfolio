import { createHmac } from 'node:crypto'
import { ownerEmailLink, whatsappDraft } from '../../../domain/contact'
import { projectTypes } from '../../../domain/editorial'
import { leadTokenPattern, validateLead } from '../../../domain/leads'
import { mediaWriter } from '../../../lib/media/writer'
import { publicSiteContent } from '../../../server/site-content'

const bodyLimit = 20_000
const respond = (status: number, data: object) => Response.json(data, {
  status, headers: { 'Cache-Control': 'no-store', ...(status === 429 ? { 'Retry-After': '3600' } : {}) },
})

export async function POST(request: Request) {
  const site = request.headers.get('sec-fetch-site')
  if (site && site !== 'same-origin' && site !== 'none') {
    return respond(403, { message: 'Submit this inquiry from the Contact page.' })
  }
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    return respond(415, { message: 'Unsupported inquiry format.' })
  }
  if (Number(request.headers.get('content-length')) > bodyLimit) return respond(413, { message: 'This inquiry is too large.' })
  const reader = request.body?.getReader()
  if (!reader) return respond(400, { message: 'Enter your inquiry details.' })
  let input
  try {
    const decoder = new TextDecoder('utf-8', { fatal: true })
    let bytes = 0
    let text = ''
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > bodyLimit) {
        await reader.cancel().catch(() => {})
        return respond(413, { message: 'This inquiry is too large.' })
      }
      text += decoder.decode(value, { stream: true })
    }
    input = JSON.parse(text + decoder.decode())
  } catch { return respond(400, { message: 'Enter your inquiry details.' }) }
  if (!input || typeof input !== 'object' || Array.isArray(input) || typeof input.token !== 'string' ||
    !leadTokenPattern.test(input.token) || input.website !== '') return respond(400, { message: 'This inquiry could not be accepted.' })

  const { values, errors } = validateLead(input)
  if (Object.keys(errors).length) return respond(422, { errors })
  const writer = mediaWriter()
  const secret = process.env.SUPABASE_MEDIA_SECRET_KEY
  const unavailable = () => respond(503, { message: 'Saving is temporarily unavailable. Try again or contact me by email.' })
  if (!writer || !secret) return unavailable()

  const { services, contact } = await publicSiteContent(false)
  const projectType = projectTypes.find(([id]) => id === values.projectTypeId)?.[1]
  const service = services.find(([id]) => id === values.serviceId)?.[1]
  if (!projectType) return respond(422, { errors: { projectTypeId: 'Choose a project type.' } })
  if (!service && (services.length || values.serviceId)) return respond(422, { errors: { serviceId: 'Choose a service currently listed on the page.' } })
  const lead = {
    name: values.name, email: values.email || null, whatsapp: values.whatsapp || null,
    project_type: projectType, service: service ?? null, brief: values.brief,
    budget: values.budget || null, deadline: values.deadline || null,
  }
  const hash = (scope: string, value: string) => createHmac('sha256', secret).update('contact:' + scope + ':' + value).digest('hex')
  const { data, error } = await writer.rpc('submit_contact_lead', {
    p_token: input.token, p_fingerprint: hash('submission', JSON.stringify(values)),
    p_email_key: values.email ? hash('email', values.email.toLowerCase()) : null,
    p_phone_key: values.whatsapp ? hash('phone', values.whatsapp) : null, p_lead: lead,
  }).abortSignal(AbortSignal.timeout(8000))
  if (error) return unavailable()
  if (data === 'conflict') return respond(409, { message: 'This submission was already used. Refresh the page and try again.' })
  if (data === 'limited') return respond(429, { message: 'Too many recent inquiries. Try again later or use the email link.' })
  if (data !== 'saved') return unavailable()

  return respond(200, {
    whatsapp: whatsappDraft(contact.whatsapp, [
      ['Name', values.name], ['Project type', projectType], ['Service', service ?? ''], ['Project brief', values.brief],
      ['Budget', values.budget], ['Deadline', values.deadline], ['Email', values.email], ['WhatsApp phone', values.whatsapp],
    ]),
    email: ownerEmailLink(contact.email),
  })
}
