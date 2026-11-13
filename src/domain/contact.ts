export const ownerContact = {
  email: 'eiabdgaming@gmail.com',
  phone: '+201007372106',
  whatsapp: 'https://wa.me/201007372106',
  instagram: 'https://www.instagram.com/abdo_ve1/',
  tiktok: 'https://www.tiktok.com/@abdo_ve_1',
} as const

export const ownerSocialLinks = [
  { label: 'Instagram', href: ownerContact.instagram },
  { label: 'TikTok', href: ownerContact.tiktok },
] as const

export const ownerEmailLink = `mailto:${ownerContact.email}?subject=${encodeURIComponent('Project inquiry')}&body=${encodeURIComponent('Hi Abdelrahman,\r\n\r\nI’d like to discuss a project.')}`

export function whatsappDraft(fields: readonly (readonly [string, string])[]) {
  const lines = fields.filter(([, value]) => value).map(([label, value]) => `${label}: ${value}`)
  return `${ownerContact.whatsapp}?text=${encodeURIComponent(['Hi Abdelrahman, I’d like to discuss a project.', '', ...lines].join('\n'))}`
}
