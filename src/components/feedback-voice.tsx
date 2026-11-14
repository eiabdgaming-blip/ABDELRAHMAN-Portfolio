'use client'

import { useEffect, useRef, useState } from 'react'
import { PlayIcon } from './icons'
import { useMediaExperience } from './media-experience'

function clock(seconds: number) {
  const whole = Math.max(0, Math.floor(seconds || 0))
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

export function FeedbackVoice({ id, duration }: { id: string; duration: number }) {
  const audio = useRef<HTMLAudioElement>(null)
  const release = useRef<() => void>(undefined)
  const pendingSeek = useRef<number | null>(null)
  const [state, setState] = useState<'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'error'>('idle')
  const [current, setCurrent] = useState(0)
  const [measuredDuration, setMeasuredDuration] = useState<number>()
  const { claimAudio } = useMediaExperience()
  const total = measuredDuration ?? duration
  const busy = state === 'loading'
  const active = state === 'playing' || busy
  const progress = total > 0 ? Math.min(100, current / total * 100) : 0

  function releaseAudio() {
    release.current?.()
    release.current = undefined
  }
  useEffect(() => {
    const node = audio.current
    return () => { node?.pause(); releaseAudio() }
  }, [])

  function toggle() {
    const node = audio.current
    if (!node) return
    if (active) { node.pause(); releaseAudio(); setState('paused'); return }
    if (state === 'error') { pendingSeek.current = null; node.load() }
    if (node.ended) { node.currentTime = 0; setCurrent(0) }
    release.current = claimAudio(() => { node.pause(); setState('paused') })
    setState('loading')
    void node.play().catch((error: DOMException) => {
      if (error.name === 'AbortError') return
      releaseAudio()
      setState('error')
    })
  }

  function updateMetadata(node: HTMLAudioElement) {
    const valid = Number.isFinite(node.duration) && node.duration > 0
    if (valid) setMeasuredDuration(node.duration)
    if (node.readyState < 1 || pendingSeek.current === null) return
    node.currentTime = Math.min(pendingSeek.current, valid ? node.duration : total)
    pendingSeek.current = null
  }

  return <div className="feedback-voice" dir="ltr">
    <audio ref={audio} preload="none" src={`/api/feedback/voice/${id}`}
      onLoadedMetadata={(event) => updateMetadata(event.currentTarget)}
      onDurationChange={(event) => updateMetadata(event.currentTarget)}
      onTimeUpdate={(event) => setCurrent(event.currentTarget.currentTime)}
      onWaiting={(event) => { if (!event.currentTarget.paused) setState('loading') }}
      onPlaying={() => setState('playing')}
      onPause={(event) => { if (!event.currentTarget.ended) { releaseAudio(); setState((previous) => previous === 'error' ? previous : 'paused') } }}
      onEnded={() => { releaseAudio(); setState('ended') }}
      onError={() => { releaseAudio(); setState('error') }} />
    <button type="button" className="glass feedback-voice-play"
      aria-label={active ? 'Pause voice note' : state === 'ended' ? 'Replay voice note' : state === 'error' ? 'Retry voice note' : 'Play voice note'}
      onClick={toggle}>
      {busy ? <span className="feedback-voice-spinner" aria-hidden="true" /> : active
        ? <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M6 4h3v12H6zm5 0h3v12h-3z" fill="currentColor" /></svg> : <PlayIcon />}
    </button>
    <div className="feedback-voice-track">
      <p><span>Voice note</span><span className="mono feedback-voice-time">{clock(current)} <span aria-hidden="true">/</span> <span data-voice-duration>{clock(total)}</span></span></p>
      <input type="range" min={0} max={total} step="0.1" value={Math.min(current, total)} aria-label="Seek voice note"
        aria-valuetext={`${clock(current)} of ${clock(total)}`} disabled={!total || state === 'error'}
        style={{ background: `linear-gradient(90deg, #594580 ${progress}%, #cecad7 ${progress}%)` }}
        onChange={(event) => {
          const node = audio.current
          if (!node) return
          const target = Number(event.currentTarget.value)
          setCurrent(target)
          if (state === 'ended') setState('paused')
          if (node.readyState >= 1) node.currentTime = target
          else {
            if (pendingSeek.current === null && node.networkState !== node.NETWORK_LOADING) {
              node.preload = 'metadata'
              node.load()
            }
            pendingSeek.current = target
          }
        }} />
    </div>
    {busy && <span className="sr-only" role="status">Loading recording…</span>}
    {state === 'error' && <span className="feedback-voice-error" role="status">Recording unavailable. Use Retry to try again.</span>}
  </div>
}
