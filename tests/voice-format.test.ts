import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { voiceFormat, voiceHeader } from '../src/lib/media/voice-format.ts'

test('recognizes real Ogg Opus with browser MIME variants', () => {
  const data = readFileSync(new URL('./fixtures/voice-opus.ogg', import.meta.url))
  for (const mime of ['audio/ogg', 'application/ogg', 'audio/ogg; codecs=opus', '']) {
    assert.equal(voiceFormat({ name: 'WhatsApp Audio.OGG', size: data.length, mime }), 'ogg')
  }
  assert.ok(voiceHeader(data, 'ogg'))
  assert.ok(!voiceHeader(data, 'mp3'))
  assert.ok(!voiceHeader(data.subarray(0, 20), 'ogg'))
  const wrongCodec = Buffer.from(data)
  wrongCodec.write('theoraXX', wrongCodec.indexOf('OpusHead'))
  assert.ok(!voiceHeader(wrongCodec, 'ogg'))
  assert.equal(voiceFormat({ name: 'audio.ogg', size: 10_000_001, mime: '' }), null)
  assert.equal(voiceFormat({ name: 'audio.ogg', size: data.length, mime: 'video/ogg' }), null)
})

test('recognizes MP3 bytes and rejects misplaced or fake audio headers', () => {
  const data = readFileSync(new URL('./fixtures/voice.mp3', import.meta.url))
  assert.ok(voiceHeader(data, 'mp3'))
  assert.ok(!voiceHeader(data, 'ogg'))
  assert.ok(voiceHeader(Buffer.from('RIFF0000WAVE'), 'wav'))
  assert.ok(!voiceHeader(Buffer.from('RIFF0000AVI '), 'wav'))
})
