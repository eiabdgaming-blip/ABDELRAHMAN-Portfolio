import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { posix } from 'node:path'
import { test } from 'node:test'
import { defaultLocale, textDirection } from '../src/domain/locale.ts'
import { visibleReelIndexes } from '../src/domain/reels.ts'
import { localHome, localProject } from './fixtures/portfolio.ts'

const handoff = new URL('../../handoff/', import.meta.url)
const publicRoot = new URL('../public/', import.meta.url)

interface AssetRecord {
  path: string
  bytes: number
  sha256: string
  rights: string
  dependencies: string[]
}

const { files: assets }: { files: AssetRecord[] } = JSON.parse(
  readFileSync(new URL('assets/ASSET_MANIFEST.json', handoff), 'utf8'),
)

function relativeFiles(root: URL) {
  return readdirSync(root, { encoding: 'utf8', recursive: true })
    .map((path) => path.split('\\').join('/'))
    .filter((path) => statSync(new URL(path, root)).isFile())
    .sort()
}

function sha256(url: URL) {
  return createHash('sha256').update(readFileSync(url)).digest('hex')
}

test('handoff paths, byte sizes and SHA-256 agree with the archive', () => {
  const checksums = new Map<string, string>()
  const ledger = readFileSync(new URL('CHECKSUMS.sha256', handoff), 'utf8')
  for (const line of ledger.trimEnd().split(/\r?\n/)) {
    const match = /^([a-f0-9]{64}) {2}(.+)$/.exec(line)
    assert.ok(match, `Invalid checksum record: ${line}`)
    const [, hash, path] = match
    assert.ok(!checksums.has(path), `Duplicate checksum path: ${path}`)
    checksums.set(path, hash)
  }

  const archiveFiles = relativeFiles(handoff)
  assert.deepEqual([...checksums.keys()].sort(), archiveFiles.filter((path) => path !== 'CHECKSUMS.sha256'))
  for (const [path, hash] of checksums) {
    assert.equal(sha256(new URL(path, handoff)), hash, path)
  }

  const manifestPaths = assets.map(({ path }) => path).sort()
  assert.deepEqual(manifestPaths, archiveFiles.filter(
    (path) => /^(assets|references)\//.test(path) && path !== 'assets/ASSET_MANIFEST.json',
  ))
  const manifestSet = new Set(manifestPaths)
  for (const asset of assets) {
    assert.equal(checksums.get(asset.path), asset.sha256, asset.path)
    assert.equal(statSync(new URL(asset.path, handoff)).size, asset.bytes, asset.path)
    for (const dependency of asset.dependencies) {
      assert.ok(manifestSet.has(dependency), `${asset.path}: missing ${dependency}`)
    }
  }
})

test('public contains only approved fonts, decorative originals and the tracked Showreel', () => {
  const approvedFonts = assets.filter(
    (asset) => asset.path.startsWith('assets/fonts/') && asset.rights === 'sil_ofl_1_1_with_notices',
  )
  assert.equal(approvedFonts.length, 5)
  const publicPaths = approvedFonts.map(({ path }) => `fonts/${posix.basename(path)}`)
  const webFonts = {
    'fonts/archivo-black.woff2': 'c1a36cce93e75bb56a9502e384249d8dd6a20189053d1628b12274bcb8437ae1',
    'fonts/geist.woff2': '2ffebe993e969069a9789d15164b7715d42491b5835516c5e3b935d5f81b05f1',
    'fonts/geist-mono.woff2': '09853cd11045cf50e8ac07faf08bd5420f181b924f4c65b93b8ee49259a03734',
  }
  const decorations = {
    'hero-left.mp4': 'assets/media/hero_star_LEFT_as_submitted.mp4',
    'hero-left-poster.png': 'assets/stills/Glass_Star_Angle_D-2.png',
    'hero-right.mp4': 'assets/media/hero_star_RIGHT_as_submitted.mp4',
    'hero-right-poster.png': 'assets/stills/Glass_Star_Angle_B-2.png',
    'hero-star.mp4': 'assets/media/Glass_Star_Angle_A.mp4',
    'hero-star-poster.png': 'assets/stills/Glass_Star_Angle_A-2-matte.png',
    'contact-star.mp4': 'assets/media/contact_star_motion_REFERENCE.mp4',
    'contact-star-poster.png': 'assets/stills/Glass_Star_Angle_C-2.png',
    'about-disk.mp4': 'assets/media/Dark_Disk_Motion_Reference.mp4',
    'about-disk-poster.png': 'assets/stills/Dark_Disk_Motion_Reference-4-matte.png',
    'glass-cube.png': 'assets/icons/Glass_Cube.png',
    'glass-moon.png': 'assets/icons/Glass_Moon.png',
    'glass-cursor.png': 'assets/icons/Glass_Cursor.png',
  }
  const showreel = {
    'videos/showreel.mp4': '8231c33f015586eaffd046079bb54724289da4c102f5d2aff1fb8ee8ffe7afbd',
    'videos/showreel-poster.png': 'd6cb5847ea7284687ccfff0d0bddd2307ccabec10da4b6d552e7911ac4a59ba8',
  }
  assert.deepEqual(relativeFiles(publicRoot), [
    ...publicPaths, ...Object.keys(webFonts), ...Object.keys(decorations).map((name) => 'visuals/' + name), ...Object.keys(showreel),
  ].sort())
  for (const [name, original] of Object.entries(decorations)) {
    const expected = assets.find(({ path }) => path === original)
    assert.ok(expected, original)
    assert.equal(sha256(new URL('visuals/' + name, publicRoot)), expected.sha256, name)
  }
  for (const [path, hash] of Object.entries({ ...webFonts, ...showreel })) {
    assert.equal(sha256(new URL(path, publicRoot)), hash, path)
  }
  for (const [index, asset] of approvedFonts.entries()) {
    assert.equal(sha256(new URL(publicPaths[index], publicRoot)), asset.sha256, asset.path)
  }
})

test('English is the document default and Arabic content retains its own direction', () => {
  assert.equal(defaultLocale, 'en')
  assert.equal(textDirection[defaultLocale], 'ltr')
  assert.equal(textDirection[localProject.title.locale], 'rtl')
})

test('local fixtures leave Home empty and keep project format independent of media dimensions', () => {
  assert.deepEqual(localHome.featuredReels, [])
  assert.deepEqual(localHome.reviews, [])
  assert.equal(localProject.format, 'reel')
  assert.equal(localProject.leadPlayback.width / localProject.leadPlayback.height, 16 / 9)
})

test('featured rail supports 0, 1, 2, 4 and 6 items without repeating cards', () => {
  assert.deepEqual(visibleReelIndexes(0, 0), [])
  assert.deepEqual(visibleReelIndexes(0, 1), [0])
  assert.deepEqual(visibleReelIndexes(1, 2), [1, 0])
  assert.deepEqual(visibleReelIndexes(0, 4), [3, 0, 1])
  assert.deepEqual(visibleReelIndexes(5, 6), [4, 5, 0])
})
