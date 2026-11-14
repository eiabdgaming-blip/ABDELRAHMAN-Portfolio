export const siteFields = {
  email: { label: 'Public email', type: 'email', max: 254 },
  whatsapp: { label: 'WhatsApp destination', type: 'url', max: 64 },
  instagram: { label: 'Instagram profile', type: 'url', max: 100 },
  tiktok: { label: 'TikTok profile', type: 'url', max: 100 },
} as const

export type SiteField = keyof typeof siteFields
export type SiteContact = Record<SiteField, string>
export type ServiceRow = { id: string; title: string; description: string; display_order: number; visible: boolean }
export type FAQRow = { id: string; question: string; answer: string; display_order: number; published: boolean }
export type Service = readonly [id: string, title: string, description: string]
export type Question = { id: string; question: string; answer: string }

export function contentText(value: FormDataEntryValue | null, max: number) {
  if (typeof value !== 'string') return null
  const clean = value.trim()
  return clean.length > 0 && clean.length <= max && !clean.includes('\0') ? clean : null
}

const destinationPatterns: Record<Exclude<SiteField, 'email'>, RegExp> = {
  whatsapp: /^https:\/\/wa\.me\/[1-9][0-9]{7,14}$/,
  instagram: /^https:\/\/(www\.)?instagram\.com\/[A-Za-z0-9_][A-Za-z0-9_.]{0,29}\/?$/,
  tiktok: /^https:\/\/(www\.)?tiktok\.com\/@[A-Za-z0-9_][A-Za-z0-9_.]{0,23}\/?$/,
}
const email = /^[A-Za-z0-9_+-]+(?:\.[A-Za-z0-9_+-]+)*@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*\.[A-Za-z]{2,63}$/

export function contactValue(field: SiteField, input: FormDataEntryValue | null) {
  const value = contentText(input, siteFields[field].max)
  if (!value) return null
  if (field === 'email') return email.test(value) && value.split('@')[0].length <= 64 ? value : null
  return destinationPatterns[field].test(value) ? value : null
}
