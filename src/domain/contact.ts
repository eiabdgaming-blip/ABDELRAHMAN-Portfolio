import type { SiteContact } from './site-content'

export const ownerContact = {
  email: 'eiabdgaming@gmail.com',
  phone: '+201007372106',
  whatsapp: 'https://wa.me/201007372106',
  instagram: 'https://www.instagram.com/abdo_ve1/',
  tiktok: 'https://www.tiktok.com/@abdo_ve_1',
} as const

export const ownerSocialLinks = (contact: SiteContact) => [
  { label: 'Instagram', href: contact.instagram },
  { label: 'TikTok', href: contact.tiktok },
] as const

export const ownerEmailLink = (email: string) => `mailto:${email.replaceAll('+', '%2B')}?subject=${encodeURIComponent('Project inquiry')}&body=${encodeURIComponent('Hi Abdelrahman,\r\n\r\nI’d like to discuss a project.')}`

export function whatsappDraft(destination: string, fields: readonly (readonly [string, string])[]) {
  const lines = fields.filter(([, value]) => value).map(([label, value]) => `${label}: ${value}`)
  return `${destination}?text=${encodeURIComponent(['Hi Abdelrahman, I’d like to discuss a project.', '', ...lines].join('\n'))}`
}
