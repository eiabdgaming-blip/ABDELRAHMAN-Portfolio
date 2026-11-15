'use client'

import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import Link from 'next/link'
import type { PlayerItem } from '../domain/display'
import { visibleReelIndexes, wrapReelIndex } from '../domain/reels'
import { InlineVideo } from './inline-video'

const number = (n: number) => String(n).padStart(2, '0')

export function ReelRail({ items, home = false, initial = 0 }: {
  items: readonly PlayerItem[]; home?: boolean; initial?: number
}) {
  const [active, setActive] = useState(Math.min(initial, items.length - 1))
  const [compact, setCompact] = useState(false)
  const start = useRef<{ x: number; y: number }>(undefined)
  const swipeUntil = useRef(0)
  const stage = useRef<HTMLDivElement>(null)
  const stopPlayback = useRef<() => void>(undefined)
  const count = items.length
  const wrap = (n: number) => wrapReelIndex(n, count)
  const slots = visibleReelIndexes(active, count)
  // Keep Home's dot row within the space between the mobile arrows.
  const dotCount = home ? Math.min(count, 7) : count
  const firstDot = Math.min(Math.max(0, active - Math.floor(dotCount / 2)), count - dotCount)

  useEffect(() => {
    const query = matchMedia('(max-width: 767px)')
    const sync = () => setCompact(query.matches)
    sync()
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [])

  if (!count) return null

  function select(index: number) {
    if (index === active) return
    stopPlayback.current?.()
    stopPlayback.current = undefined
    setActive(index)
  }

  function move(step: number) {
    if (count > 1) select(wrap(active + step))
  }

  function keys(event: KeyboardEvent) {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return
    event.preventDefault()
    const moveFocus = compact && stage.current?.contains(document.activeElement)
    const rail = event.currentTarget
    const dotFocused = home && document.activeElement?.matches('.rail-dot')
    move(event.key === 'ArrowRight' ? 1 : -1)
    if (moveFocus) requestAnimationFrame(() => stage.current?.querySelector<HTMLElement>('[data-slot="active"] .inline-toggle')?.focus())
    if (dotFocused) requestAnimationFrame(() => rail.querySelector<HTMLElement>('.rail-dot[aria-current]')?.focus())
  }

  return (
    <div className={`reel-rail ${home ? 'home-rail' : ''}`} role="region" aria-roledescription="carousel" aria-label={home ? 'Featured reels' : 'Work reels'}
      onKeyDown={keys} data-count={count}>
      <div className="rail-caption mono"><span>{home ? 'Featured reels' : 'Published reels'}</span><span aria-hidden="true">{number(active + 1)} / {number(count)}</span></div>
      <div className="rail-controls">
        <button className="glass rail-arrow previous" aria-label="Previous reel" disabled={count < 2} onClick={() => move(-1)}>
          <span aria-hidden="true">‹</span><span className="mobile-arrow"> Previous</span>
        </button>
        <div className="reel-stage" ref={stage}
          onPointerDown={(event) => { if (event.pointerType !== 'mouse') start.current = { x: event.clientX, y: event.clientY } }}
          onPointerCancel={() => { start.current = undefined }}
          onPointerUp={(event) => {
            const origin = start.current
            start.current = undefined
            if (!origin) return
            const dx = event.clientX - origin.x
            const dy = event.clientY - origin.y
            if (Math.abs(dx) > 38 && Math.abs(dx) > Math.abs(dy) * 1.4) {
              swipeUntil.current = performance.now() + 320
              move(dx < 0 ? 1 : -1)
            }
          }}>
          {slots.map((index) => {
            const item = items[index]
            const selected = index === active
            const slot = selected ? 'active' : index === wrap(active + 1) ? 'right' : 'left'
            return (
              <InlineVideo key={item.id} item={item} slot={slot} inactive={compact && !selected}
                onStart={(stop) => { stopPlayback.current = stop }}
                canStart={() => performance.now() >= swipeUntil.current} />
            )
          })}
        </div>
        <button className="glass rail-arrow next" aria-label="Next reel" disabled={count < 2} onClick={() => move(1)}>
          <span className="mobile-arrow">Next </span><span aria-hidden="true">›</span>
        </button>
        <div className="rail-position">
          <span className="sr-only" role="status">{`Reel ${active + 1} of ${count}`}</span>
          {items.slice(firstDot, firstDot + dotCount).map(({ id }, offset) => {
            const index = firstDot + offset
            return <button key={id} className="rail-dot" aria-label={`Go to reel ${index + 1}`}
              inert={compact} aria-hidden={compact || undefined}
              aria-current={index === active ? 'true' : undefined} onClick={() => select(index)}><span /></button>
          })}
          <span className="rail-count mono" aria-hidden="true">{number(active + 1)} / {number(count)}</span>
        </div>
      </div>
      {home && <div className="rail-footer"><Link className="glass" href="/work?format=reels">View all reels ↗</Link></div>}
    </div>
  )
}
