'use client'

import { useEffect, useRef, useState } from 'react'
import { ambientAssets, decorativePath } from '../domain/decorative-assets'
import { useMediaExperience } from './media-experience'

export function AmbientMedia({ id, priority, className, desktopOnly = false }: {
  id: keyof typeof ambientAssets; priority: number; className: string; desktopOnly?: boolean
}) {
  const { ambientIds, allowAmbient } = useMediaExperience()
  const allow = useRef(allowAmbient)
  allow.current = allowAmbient
  const container = useRef<HTMLSpanElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  const [ready, setReady] = useState(false)
  const playing = ambientIds.includes(id)
  const [clip, poster] = ambientAssets[id]

  useEffect(() => {
    const motion = matchMedia('(prefers-reduced-motion: reduce)')
    const compact = matchMedia('(max-width: 767px)')
    const dataPreference = matchMedia('(prefers-reduced-data: reduce)')
    const connection = (navigator as Navigator & { connection?: EventTarget & { saveData?: boolean; effectiveType?: string } }).connection
    let sectionVisible = false
    let slotVisible = false
    const node = container.current!
    const section = node.closest('[data-ambient-section]') ?? node
    function sync() {
      const reduced = motion.matches || dataPreference.matches || connection?.saveData || /(^|slow-)2g$/.test(connection?.effectiveType ?? '')
      allow.current(id, (id === 'hero-left' || sectionVisible) && slotVisible && !document.hidden && !reduced && !(desktopOnly && compact.matches)
        && getComputedStyle(node).visibility === 'visible' ? priority : null)
    }
    const sections = new IntersectionObserver(([entry]) => {
      sectionVisible = entry.intersectionRatio >= .25
      sync()
    }, { threshold: [.25] })
    const slots = new IntersectionObserver(([entry]) => { slotVisible = entry.isIntersecting; sync() })
    sections.observe(section)
    slots.observe(node)
    for (const preference of [motion, compact, dataPreference]) preference.addEventListener('change', sync)
    document.addEventListener('visibilitychange', sync)
    connection?.addEventListener('change', sync)
    return () => {
      sections.disconnect(); slots.disconnect()
      for (const preference of [motion, compact, dataPreference]) preference.removeEventListener('change', sync)
      document.removeEventListener('visibilitychange', sync)
      connection?.removeEventListener('change', sync)
      allow.current(id, null)
    }
  }, [id, priority, desktopOnly])

  useEffect(() => {
    const node = video.current
    return () => {
      node?.pause()
      setReady(false)
    }
  }, [playing])

  return (
    <span ref={container} className={`ambient ${className}`} aria-hidden="true" data-ambient={id}>
      <img src={decorativePath(poster)} alt="" draggable="false" loading={priority < 3 ? 'eager' : 'lazy'}
        fetchPriority="low" decoding="async" />
      {playing && <video ref={video} src={decorativePath(clip)} autoPlay muted playsInline loop tabIndex={-1}
        className={ready ? 'is-playing' : undefined} onPlaying={() => setReady(true)} onError={() => setReady(false)} />}
    </span>
  )
}
