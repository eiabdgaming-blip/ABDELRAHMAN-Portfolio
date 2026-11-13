'use client'

import type { PlayerItem } from '../domain/display'
import { useEffect, useRef, useState } from 'react'
import { AmbientMedia } from './ambient'

function HeroShowreel({ item }: { item: PlayerItem }) {
  const video = useRef<HTMLVideoElement>(null)
  const [started, setStarted] = useState(false)

  useEffect(() => {
    const node = video.current!
    node.defaultMuted = true
    node.muted = true
    let inView: boolean | undefined

    function syncPlayback() {
      if (document.hidden || inView === false) {
        node.pause()
      } else if (inView && node.paused) {
        void node.play().catch(() => {})
      }
    }

    const observer = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting
      syncPlayback()
    })
    observer.observe(node)
    node.addEventListener('play', syncPlayback)
    document.addEventListener('visibilitychange', syncPlayback)
    window.addEventListener('pageshow', syncPlayback)
    return () => {
      observer.disconnect()
      node.removeEventListener('play', syncPlayback)
      document.removeEventListener('visibilitychange', syncPlayback)
      window.removeEventListener('pageshow', syncPlayback)
      node.pause()
    }
  }, [])

  return (
    <div className="hero-poster">
      <video ref={video} src={item.src} poster={item.poster} autoPlay muted loop playsInline
        disablePictureInPicture aria-hidden="true" onPlaying={() => setStarted(true)} />
      {!started && <span className="poster-caption mono">Showreel　/　00:06.6</span>}
    </div>
  )
}

export function Hero({ showreel }: { showreel?: PlayerItem }) {
  return (
    <section id="hero" className="hero" tabIndex={-1} aria-labelledby="hero-heading" data-ambient-section>
      {showreel && (
        <div className="hero-decor">
          <AmbientMedia id="hero-left" priority={0} className="hero-left" />
          <AmbientMedia id="hero-right" priority={2} className="hero-right" />
          <AmbientMedia id="hero-star" priority={1} className="hero-star" />
        </div>
      )}
      <div className="hero-body container">
        <div className="hero-type">
          <h1 id="hero-heading" tabIndex={-1}>ABDELRAHMAN</h1>
          <span className="hero-tick" aria-hidden="true" />
          <p className="eyebrow">Video Editor &amp; Motion Designer</p>
        </div>
        <div className="hero-feature">
          {showreel && <HeroShowreel item={showreel} />}
          <div className="hero-editorial mono">
            <div className="hero-editorial-detail">
              <span>Frame by frame</span>
              <div className="hero-keyframes" aria-hidden="true"><i /><i /><i /></div>
            </div>
            <a className="hero-explore" href="#reels">Scroll to explore <span aria-hidden="true">↓</span></a>
          </div>
        </div>
      </div>
      <div className="hero-rule container section-rule" aria-hidden="true" />
    </section>
  )
}
