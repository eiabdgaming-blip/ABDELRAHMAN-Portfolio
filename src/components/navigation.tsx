'use client'

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { paintNavPlate, refractNavPlate } from './nav-optics'

const destinations = [
  { id: 'home', label: 'Home', href: '/#hero', section: 'hero' },
  { id: 'work', label: 'Work', href: '/work', section: null },
  { id: 'reels', label: 'Reels', href: '/#reels', section: 'reels' },
  { id: 'services', label: 'Services', href: '/#services', section: 'services' },
  { id: 'feedback', label: 'Client Feedback', href: '/#feedback', section: 'feedback' },
  { id: 'faq', label: 'FAQ', href: '/#faq', section: 'faq' },
  { id: 'contact', label: 'Contact', href: '/#contact', section: 'contact' },
] as const

type Destination = typeof destinations[number]['id']

export function Navigation({ initial }: { initial: Destination }) {
  const [active, setActive] = useState(initial)
  const [hover, setHover] = useState<Destination>()
  const [focus, setFocus] = useState<Destination>()
  const [open, setOpen] = useState(false)
  const [geometry, setGeometry] = useState<CSSProperties>()
  const header = useRef<HTMLDivElement>(null)
  const pending = useRef<{ id: Destination; until: number }>(undefined)
  const group = useRef<HTMLElement>(null)
  const disclosure = useRef<HTMLDetailsElement>(null)
  const lens = useRef<HTMLSpanElement>(null)
  const plate = useRef<HTMLCanvasElement>(null)
  const optics = useRef<HTMLCanvasElement>(null)
  const target = focus ?? hover ?? active

  useEffect(() => {
    setActive(initial)
    if (initial === 'work') return
    const sections = destinations.flatMap(({ id, section }) => {
      const node = section && document.getElementById(section)
      return node ? [{ id, node }] : []
    })
    let frame = 0
    function sync() {
      frame = 0
      const line = (header.current?.getBoundingClientRect().bottom ?? 0) + 24
      let current: Destination = 'home'
      for (const { id, node } of sections) {
        if (node.getBoundingClientRect().top > line) break
        current = id
      }
      if (pending.current?.id !== current && (pending.current?.until ?? 0) > performance.now()) return
      pending.current = undefined
      setActive(current)
    }
    function schedule() {
      if (!frame) frame = requestAnimationFrame(sync)
    }
    function settle() {
      pending.current = undefined
      schedule()
    }
    schedule()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    window.addEventListener('hashchange', schedule)
    window.addEventListener('popstate', settle)
    window.addEventListener('pageshow', settle)
    document.addEventListener('scrollend', settle)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      window.removeEventListener('hashchange', schedule)
      window.removeEventListener('popstate', settle)
      window.removeEventListener('pageshow', settle)
      document.removeEventListener('scrollend', settle)
    }
  }, [initial])

  useLayoutEffect(() => {
    const nav = group.current!
    const backing = plate.current!
    const surface = optics.current!
    const indicator = lens.current!
    let frame = 0
    let snap = 0
    let last = -Infinity
    let layout = ''
    let bitmap: ImageData | undefined
    let dpr = 1
    const motion = matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => {
      const bounds = nav.getBoundingClientRect()
      if (!bounds.width || !bounds.height) return
      const label = nav.querySelector<HTMLElement>(`[data-destination="${target}"]`)!.getBoundingClientRect()
      setGeometry({
        '--lens-x': `${label.left - bounds.left}px`, '--lens-y': `${label.top - bounds.top}px`,
        '--lens-r': `${bounds.right - label.right}px`, '--lens-b': `${bounds.bottom - label.bottom}px`,
        '--lens-width': `${label.width}px`, '--lens-height': `${label.height}px`,
      } as CSSProperties)
    }
    const sample = () => {
      if (bitmap) refractNavPlate(surface, bitmap, indicator.getBoundingClientRect(), nav.getBoundingClientRect(), dpr)
    }
    const layoutSignature = () => {
      const bounds = nav.getBoundingClientRect()
      return [bounds.width, bounds.height, devicePixelRatio, ...Array.from(nav.querySelectorAll('[data-destination]'), (item) => {
        const box = item.getBoundingClientRect()
        return [box.left - bounds.left, box.top - bounds.top, box.width, box.height].join(',')
      })].join('/')
    }
    const measure = () => {
      const bounds = nav.getBoundingClientRect()
      if (!bounds.width || !bounds.height) return
      const next = layoutSignature()
      if (next === layout) return
      layout = next
      dpr = Math.min(1.25, devicePixelRatio)
      bitmap = paintNavPlate(backing, bounds.width, bounds.height, dpr)
      nav.dataset.snap = 'true'
      update()
      cancelAnimationFrame(snap)
      snap = requestAnimationFrame(() => {
        sample()
        snap = requestAnimationFrame(() => { delete nav.dataset.snap })
      })
    }
    const observer = new ResizeObserver(measure)
    observer.observe(nav)
    for (const link of nav.querySelectorAll('[data-destination]')) observer.observe(link)
    const started = performance.now()
    const tick = (now: number) => {
      if (now - last >= 1000 / 30 || motion.matches) { sample(); last = now }
      if (!motion.matches && now - started < 340) frame = requestAnimationFrame(tick)
      else sample()
    }
    const bounds = nav.getBoundingClientRect()
    if (bounds.width && bounds.height) {
      layout = layoutSignature()
      dpr = Math.min(1.25, devicePixelRatio)
      bitmap = paintNavPlate(backing, bounds.width, bounds.height, dpr)
      update()
      frame = requestAnimationFrame(tick)
    }
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
      cancelAnimationFrame(snap)
      delete nav.dataset.snap
    }
  }, [target, open])

  function closeMenu() {
    if (disclosure.current?.open) disclosure.current.open = false
  }

  return (
    <header className="site-header">
      <div className="site-nav" ref={header}>
        <a className="nav-brand glass" href="/#hero" aria-label="ABDELRAHMAN">
          <span className="brand-ink" data-text="ABDELRAHMAN">ABDELRAHMAN</span>
        </a>
        <details className="nav-disclosure" ref={disclosure}
          onToggle={(event) => setOpen(event.currentTarget.open)}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && disclosure.current?.open) {
              closeMenu()
              disclosure.current.querySelector('summary')?.focus()
            }
          }}>
          <summary className="glass" aria-controls="primary-navigation">Menu <span aria-hidden="true">{open ? '−' : '+'}</span></summary>
          <nav ref={group} id="primary-navigation" className="nav-links" aria-label="Primary"
            style={geometry} data-measured={!!geometry} onPointerLeave={() => setHover(undefined)}>
            <canvas className="nav-plate" ref={plate} aria-hidden="true" />
            <span className="nav-lens" ref={lens} aria-hidden="true"><canvas ref={optics} /></span>
            {destinations.map(({ id, label, href, section }) => (
              <a key={id} href={href} data-destination={id}
                aria-current={id === active ? (id === 'work' ? 'page' : 'location') : undefined}
                onPointerEnter={(event) => { if (event.pointerType === 'mouse' && matchMedia('(hover: hover)').matches) setHover(id) }}
                onFocus={(event) => { if (event.currentTarget.matches(':focus-visible')) setFocus(id) }}
                onBlur={() => setFocus(undefined)}
                onClick={(event) => {
                  if (event.button || event.metaKey || event.altKey || event.ctrlKey || event.shiftKey) return
                  setFocus(undefined)
                  setHover(undefined)
                  if (section && location.pathname === '/') {
                    pending.current = { id, until: performance.now() + 1100 }
                    setActive(id)
                    if (location.search) {
                      event.preventDefault()
                      if (location.hash === '#' + section) document.getElementById(section)?.scrollIntoView()
                      else location.hash = section
                    }
                  }
                  closeMenu()
                }}>{label}</a>
            ))}
            <span className="nav-color" aria-hidden="true">{destinations.map(({ id, label }) => <span key={id}>{label}</span>)}</span>
          </nav>
        </details>
      </div>
    </header>
  )
}
