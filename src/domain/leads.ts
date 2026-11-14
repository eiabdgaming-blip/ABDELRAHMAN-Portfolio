import { contactValue } from './site-content'
import { projectTypes } from './editorial'

export const leadStatuses = {
  new: 'New', contacted: 'Contacted', 'in-progress': 'In Progress', completed: 'Completed', archived: 'Archived',
} as const
export const leadFields = { name: 100, email: 254, whatsapp: 16, projectTypeId: 20, serviceId: 80, brief: 3000, budget: 100, deadline: 100 } as const
export type LeadField = keyof typeof leadFields
export const leadFieldsList = Object.keys(leadFields) as LeadField[]
export const phonePattern = /^\+[1-9][0-9]{7,14}$/
export const leadTokenPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/

export function validateLead(input: Record<string, unknown>) {
  const values = {} as Record<LeadField, string>
  const errors: Partial<Record<LeadField, string>> = {}
  for (const key of leadFieldsList) {
    const raw = input[key] ?? ''
    if (typeof raw !== 'string' || raw.length > leadFields[key] || raw.includes('\0')) {
      errors[key] = 'Check this field and its length.'
      values[key] = ''
    } else values[key] = raw.trim()
  }
  if (!values.name) errors.name ??= 'Enter your name.'
  if (!values.brief) errors.brief ??= 'Enter a project brief.'
  if (!projectTypes.some(([id]) => id === values.projectTypeId)) errors.projectTypeId ??= 'Choose a project type.'
  if (values.serviceId && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(values.serviceId)) errors.serviceId = 'Choose an available service.'
  if (values.email && !contactValue('email', values.email)) errors.email = 'Enter a valid email address.'
  if (values.whatsapp && !phonePattern.test(values.whatsapp)) errors.whatsapp = 'Enter a phone number with its country code, starting with +.'
  if (!values.email && !values.whatsapp) errors.email ??= 'Add a valid email address or WhatsApp phone number.'
  return { values, errors }
}
