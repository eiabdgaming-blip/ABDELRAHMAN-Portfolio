export const formats = {
  jpg: { resource: 'image', mime: 'image/jpeg' },
  png: { resource: 'image', mime: 'image/png' },
  webp: { resource: 'image', mime: 'image/webp' },
  mp4: { resource: 'video', mime: 'video/mp4' },
  webm: { resource: 'video', mime: 'video/webm' },
} as const

export type Format = keyof typeof formats
export const byteLimits = { image: 10_000_000, video: 100_000_000 }
export const maxImagePixels = 25_000_000

export function validateFile(name: string, size: number, mime: string) {
  const dot = name.lastIndexOf('.')
  const extension = dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
  const format = extension === 'jpeg' ? 'jpg' : extension
  if (!format || !Object.hasOwn(formats, format)) throw new Error('Choose a JPEG, PNG, WebP, MP4 or WebM file.')
  const kind = formats[format as Format]
  if (mime && mime !== kind.mime) throw new Error('The file type does not match its extension.')
  if (!Number.isSafeInteger(size) || size < 1 || size > byteLimits[kind.resource]) {
    throw new Error(`Choose a nonempty ${kind.resource} up to ${byteLimits[kind.resource] / 1_000_000} MB.`)
  }
  return format as Format
}

export function mediaTitle(value: string) {
  const title = value.trim()
  if (!title || title.length > 120) throw new Error('Enter a title of 1–120 characters.')
  return title
}
