'use client'

import { useEffect, useRef, useState } from 'react'
import type { PlayerItem } from '../domain/display'
import { PlayIcon } from './icons'
import { useMediaExperience } from './media-experience'

const compactPoster = '(max-width: 767px) and (max-resolution: 1.5dppx)'
const reelPoster = compactPoster + ', (min-width: 768px) and (max-resolution: 1dppx)'

export function InlineVideo({ item, slot, inactive = false, onStart, canStart }: {
  item: PlayerItem
  slot?: string
  inactive?: boolean
  onStart?: (stop: () => void) => void
  canStart?: () => boolean
}) {
  const video = useRef<HTMLVideoElement>(null)
  const frame = useRef<HTMLDivElement>(null)
  const release = useRef<() => void>(undefined)
  const attempt = useRef(0)
  const [playing, setPlaying] = useState(false)
  const [hasFrame, setHasFrame] = useState(false)
  const [muted, setMuted] = useState(false)
  const [error, setError] = useState(false)
  const { claimAudio } = useMediaExperience()

  function stop(node = video.current) {
    attempt.current++
    if (node?.hasAttribute('src')) {
      node.pause()
      node.removeAttribute('src')
      node.load()
    }
    release.current?.()
    release.current = undefined
    setHasFrame(false)
    setPlaying(false)
    setError(false)
  }

  useEffect(() => {
    const node = video.current!
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting && node.hasAttribute('src')) stop(node)
    })
    observer.observe(frame.current!)
    const hide = () => { if (document.hidden) stop(node) }
    const leave = () => stop(node)
    document.addEventListener('visibilitychange', hide)
    window.addEventListener('pagehide', leave)
    return () => {
      observer.disconnect()
      document.removeEventListener('visibilitychange', hide)
      window.removeEventListener('pagehide', leave)
      stop(node)
    }
  }, [])

  useEffect(() => {
    if (inactive && video.current?.hasAttribute('src')) stop()
  }, [inactive])

  function failed() {
    stop()
    setError(true)
  }

  function play() {
    if (inactive) return
    const node = video.current!
    if (!node.paused) return
    if (!release.current) {
      release.current = claimAudio(() => stop(node))
      onStart?.(() => stop(node))
    }
    if (!node.hasAttribute('src')) node.src = item.src
    if (node.ended) node.currentTime = 0
    setError(false)
    const current = ++attempt.current
    node.play().catch(() => { if (attempt.current === current) failed() })
  }

  return (
    <div className="inline-video reel-cover" ref={frame}
      inert={inactive} aria-hidden={inactive || undefined} data-slot={slot} data-playing={playing} data-has-frame={hasFrame}>
      <picture>
        {item.smallPoster && <source media={slot ? reelPoster : compactPoster} srcSet={item.smallPoster} />}
        <img src={item.poster} alt="" loading="lazy" draggable="false" decoding="async" />
      </picture>
      <video ref={video} muted={muted} playsInline preload="none" aria-hidden="true"
        onPlaying={() => { setHasFrame(true); setPlaying(true) }}
        onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}
        onError={(event) => { if (event.currentTarget.hasAttribute('src')) failed() }} />
      <button type="button" className="inline-toggle" aria-label={`${playing ? 'Pause' : 'Play'} ${item.title}`}
        onClick={(event) => {
          if (event.detail > 0 && canStart && !canStart()) return
          if (video.current?.paused) play()
          else video.current?.pause()
        }}>
        <span className="glass round-play">{playing ? <span aria-hidden="true">Ⅱ</span> : <PlayIcon />}</span>
      </button>
      {hasFrame && <button type="button" className="glass inline-mute" aria-label={`${muted ? 'Unmute' : 'Mute'} ${item.title}`}
        onClick={() => setMuted(!muted)}>{muted ? 'Unmute' : 'Mute'}</button>}
      {error && <p className="inline-error" role="alert">Video unavailable. Press Play to retry.</p>}
    </div>
  )
}
