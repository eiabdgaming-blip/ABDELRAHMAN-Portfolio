'use client'

import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { PlayerItem } from '../domain/display'
import { textDirection } from '../domain/locale'
import { PlayIcon } from './icons'

type Presentation =
  | { kind: 'video'; items: readonly PlayerItem[]; index: number }
  | { kind: 'proof'; title: string; content: ReactNode }

interface MediaControls {
  showVideo: (items: readonly PlayerItem[], index: number, trigger: HTMLElement) => void
  showProof: (title: string, content: ReactNode, trigger: HTMLElement) => void
  claimAudio: (stop: () => void) => () => void
  allowAmbient: (id: string, priority: number | null) => void
  ambientIds: string[]
  foreground: boolean
}

const MediaContext = createContext<MediaControls | null>(null)
export const useMediaExperience = () => useContext(MediaContext)!

export function MediaExperience({ children }: { children: ReactNode }) {
  const [presentation, setPresentation] = useState<Presentation>()
  const [eligible, setEligible] = useState<Record<string, number>>({})
  const [audioActive, setAudioActive] = useState(false)
  const audioStop = useRef<() => void>(undefined)
  const restoration = useRef<{ element: HTMLElement; x: number; y: number }>(undefined)

  function restore() {
    const previous = restoration.current
    if (!previous) return
    restoration.current = undefined
    setPresentation(undefined)
    requestAnimationFrame(() => {
      const fallback = document.querySelector<HTMLElement>('main h1')
      const target = previous.element.isConnected ? previous.element : fallback
      target?.focus({ preventScroll: true })
      window.scrollTo({ left: previous.x, top: previous.y, behavior: 'instant' })
    })
  }

  useEffect(() => {
    window.addEventListener('popstate', restore)
    return () => window.removeEventListener('popstate', restore)
  }, [])

  function open(next: Presentation, element: HTMLElement) {
    if (restoration.current) return
    audioStop.current?.()
    restoration.current = { element, x: window.scrollX, y: window.scrollY }
    history.pushState({ ...history.state, abdelModal: true }, '')
    setPresentation(next)
  }

  function close() {
    if (history.state?.abdelModal) history.back()
    else restore()
  }

  function claimAudio(stop: () => void) {
    audioStop.current?.()
    audioStop.current = stop
    setAudioActive(true)
    return () => {
      if (audioStop.current === stop) {
        audioStop.current = undefined
        setAudioActive(false)
      }
    }
  }

  function allowAmbient(id: string, priority: number | null) {
    setEligible((current) => {
      if (priority === null) {
        if (!(id in current)) return current
        const next = { ...current }
        delete next[id]
        return next
      }
      return current[id] === priority ? current : { ...current, [id]: priority }
    })
  }

  const foreground = !!presentation || audioActive
  const ambientIds = Object.keys(eligible).filter((id) => !foreground || id === 'hero-left')
    .sort((a, b) => eligible[a] - eligible[b]).slice(0, 2)

  return (
    <MediaContext.Provider value={{
      showVideo: (items, index, trigger) => open({ kind: 'video', items: [...items], index }, trigger),
      showProof: (title, content, trigger) => open({ kind: 'proof', title, content }, trigger),
      claimAudio, allowAmbient, ambientIds, foreground,
    }}>
      {children}
      {presentation && (
        <MediaDialog close={close} title={presentation.kind === 'video' ? presentation.items[presentation.index].title : presentation.title}
          locale={presentation.kind === 'video' ? presentation.items[presentation.index].locale : 'en'}
          proof={presentation.kind === 'proof'}>
          {presentation.kind === 'video'
            ? <Transport key={presentation.items[presentation.index].id} item={presentation.items[presentation.index]}
                previous={presentation.index > 0 ? () => setPresentation({ ...presentation, index: presentation.index - 1 }) : undefined}
                next={presentation.index + 1 < presentation.items.length ? () => setPresentation({ ...presentation, index: presentation.index + 1 }) : undefined} />
            : presentation.content}
        </MediaDialog>
      )}
    </MediaContext.Provider>
  )
}

function MediaDialog({ close, title, locale, proof, children }: {
  close: () => void; title: string; locale: 'en' | 'ar'; proof: boolean; children: ReactNode
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  useLayoutEffect(() => {
    const node = dialog.current!
    node.showModal()
    const before = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      node.close()
      document.body.style.overflow = before
    }
  }, [])
  return (
    <dialog ref={dialog} className={proof ? 'media-dialog proof-dialog' : 'media-dialog'}
      aria-labelledby="media-heading" onCancel={(event) => { event.preventDefault(); close() }}
      onClick={(event) => { if (event.target === event.currentTarget) close() }}>
      <div className="dialog-frame">
        <header><h2 id="media-heading" lang={locale} dir={textDirection[locale]}>{title}</h2>
          <button className="glass" onClick={close} autoFocus>Close</button></header>
        {children}
      </div>
    </dialog>
  )
}

function timecode(seconds: number) {
  const whole = Math.max(0, Math.floor(seconds))
  return [Math.floor(whole / 60), whole % 60].map((part) => String(part).padStart(2, '0')).join(':')
}

function Transport({ item, previous, next }: { item: PlayerItem; previous?: () => void; next?: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const playControl = useRef<HTMLButtonElement>(null)
  const pendingSeek = useRef<number | undefined>(undefined)
  const [loaded, setLoaded] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(false)
  const [duration, setDuration] = useState(item.duration)
  const [current, setCurrent] = useState(0)
  const [error, setError] = useState(false)
  const [nativeControls, setNativeControls] = useState(false)
  const [volume, setVolume] = useState(1)
  const ratio = item.width / item.height

  useLayoutEffect(() => {
    if (document.activeElement?.closest('dialog') == null) playControl.current?.focus({ preventScroll: true })
  }, [])

  function attach() {
    const node = video.current!
    if (!node.getAttribute('src')) node.src = item.src
    setLoaded(true)
    return node
  }

  async function playPause() {
    const node = attach()
    if (!node.paused) { node.pause(); return }
    if (node.ended) node.currentTime = 0
    setError(false)
    try {
      await node.play()
    } catch {
      setNativeControls(true)
    }
  }

  return (
    <>
      <div className="player-media" style={{ '--player-ratio': ratio } as CSSProperties} dir="ltr">
        <video ref={video} aria-label={item.title} poster={item.poster} playsInline preload="none" muted={muted} controls={nativeControls}
          onLoadedMetadata={(event) => {
            const node = event.currentTarget
            if (Number.isFinite(node.duration)) setDuration(node.duration)
            if (pendingSeek.current !== undefined) { node.currentTime = pendingSeek.current; pendingSeek.current = undefined }
          }}
          onTimeUpdate={(event) => setCurrent(event.currentTarget.currentTime)}
          onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}
          onError={() => { setError(true); setPlaying(false) }} />
        {!loaded && <button className="round-play glass player-overlay" aria-label="Play video" onClick={playPause}><PlayIcon /></button>}
        {error && <p role="alert" className="media-error">Playback is unavailable. <a href={item.src}>Open original</a></p>}
      </div>
      <div className="player-controls" dir="ltr">
        <div className="player-seek">
          <bdi>{timecode(current)}</bdi>
          <input aria-label="Seek video" type="range" min="0" max={duration || 1} step="0.05" value={Math.min(current, duration)}
            aria-valuetext={timecode(current)} onChange={(event) => {
              const position = Number(event.target.value)
              const node = attach()
              if (node.readyState > 0) node.currentTime = position
              else { pendingSeek.current = position; node.preload = 'metadata'; node.load() }
              setCurrent(position)
            }} />
          <bdi>{timecode(duration)}</bdi>
        </div>
        <div className="transport">
          <button className="glass selected" ref={playControl} onClick={playPause}>{playing ? 'Pause' : 'Play'}</button>
          <button className="glass" aria-pressed={muted} onClick={() => setMuted(!muted)}>{muted ? 'Unmute' : 'Mute'}</button>
          <input className="player-volume" aria-label="Volume" type="range" min="0" max="1" step=".05" value={volume}
            onChange={(event) => { const level = Number(event.target.value); video.current!.volume = level; setVolume(level) }} />
          <span className="transport-space" />
          <button className="glass" onClick={() => { video.current?.pause(); previous?.() }} disabled={!previous}>Previous</button>
          <button className="glass" onClick={() => { video.current?.pause(); next?.() }} disabled={!next}>Next</button>
        </div>
      </div>
    </>
  )
}
