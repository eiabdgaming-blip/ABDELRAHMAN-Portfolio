export const voiceByteLimit = 10_000_000
export const voiceDurationLimit = 300
export const voiceFormats = {
  mp3: ['audio/mpeg', 'audio/mp3'],
  wav: ['audio/wav', 'audio/x-wav', 'audio/wave', 'audio/vnd.wave'],
  ogg: ['audio/ogg', 'application/ogg'],
} as const
export type VoiceFormat = keyof typeof voiceFormats

export function voiceFormat(file: { name: string; size: number; mime: string } | undefined): VoiceFormat | null {
  if (!file || typeof file.name !== 'string' || file.name.length > 255 ||
    !Number.isSafeInteger(file.size) || file.size < 1 || file.size > voiceByteLimit || typeof file.mime !== 'string') return null
  const format = /\.(mp3|wav|ogg)$/i.exec(file.name)?.[1].toLowerCase() as VoiceFormat | undefined
  const mime = file.mime.split(';', 1)[0].trim().toLowerCase()
  return format && (!mime || (voiceFormats[format] as readonly string[]).includes(mime)) ? format : null
}

export function voiceHeader(bytes: Uint8Array, format: VoiceFormat) {
  const has = (offset: number, value: string) => Array.from(value).every((char, index) => bytes[offset + index] === char.charCodeAt(0))
  if (format === 'wav') return has(0, 'RIFF') && has(8, 'WAVE')
  if (format === 'mp3') return has(0, 'ID3') ||
    (bytes[0] === 0xff && (bytes[1] & 0xe6) === 0xe2 && (bytes[1] & 0x18) !== 0x08 &&
      (bytes[2] & 0xf0) !== 0xf0 && (bytes[2] & 0x0c) !== 0x0c)
  if (!has(0, 'OggS') || bytes[4] !== 0 || bytes[5] !== 2 || !bytes[26]) return false
  const start = 27 + bytes[26]
  const packetSize = bytes[27]
  return (packetSize >= 19 && bytes.length >= start + 19 && has(start, 'OpusHead')) ||
    (packetSize >= 30 && bytes.length >= start + 30 && has(start, '\x01vorbis'))
}
