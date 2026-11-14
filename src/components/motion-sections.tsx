'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { decorativePath } from '../domain/decorative-assets'
import { useMediaExperience } from './media-experience'
import { PlayIcon } from './icons'

function useVisible<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting))
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])
  return { ref, visible }
}

const frames = 24 * 24
const tracks = [
  ['V3', 'Titles', [[8, 18, 'CLIP_01', [26, 90]], [62, 14, 'CLIP_02', [62]]]],
  ['V2', 'B-roll', [[2, 22, 'CLIP_01', [28]], [30, 30, 'CLIP_02', [43]], [68, 26, 'CLIP_03', [52]]]],
  ['V1', 'Main', [[0, 96, 'CLIP_01', [27, 63, 90]]]],
  ['A1', 'Dialog', [[4, 40, 'Dialog A', []], [50, 44, 'Dialog B', []]]],
  ['A2', 'SFX', [[12, 6, 'Rise', []], [34, 8, 'Hit', []], [58, 6, 'Cut', []], [78, 10, 'Sweep', []]]],
  ['A3', 'Music', [[0, 96, 'Music bed', [11, 48, 88]]]],
] as const

const wave = [2, 6, 10, 9, 5, 2, 6, 10, 8, 2, 4, 7, 10]
  .map((height, index) => `M${index * 8} ${12 - height}h7v${height}h-7Z`).join('')

function rulerTime(frame: number) {
  return '00:00:' + String(Math.floor(frame / 24)).padStart(2, '0') + ':' + String(frame % 24).padStart(2, '0')
}

export function Timeline() {
  const [frame, setFrame] = useState(180)
  const [playing, setPlaying] = useState(false)
  const [motion, setMotion] = useState(false)
  const [tabVisible, setTabVisible] = useState(true)
  const { ref, visible } = useVisible<HTMLDivElement>()
  const { foreground } = useMediaExperience()
  const frameRef = useRef(frame)
  frameRef.current = frame

  useEffect(() => {
    const preference = matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => setMotion(preference.matches)
    const visibility = () => setTabVisible(!document.hidden)
    sync()
    preference.addEventListener('change', sync)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      preference.removeEventListener('change', sync)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [])

  useEffect(() => {
    if (!playing || !visible || foreground || !tabVisible) return
    const start = performance.now()
    const from = frameRef.current
    let animation = 0
    let displayed = from
    const advance = (now: number) => {
      const increment = (now - start) * 24 / 1000
      const next = Math.min(frames, from + (motion ? Math.floor(increment / 24) * 24 : Math.floor(increment)))
      if (next !== displayed) { displayed = next; setFrame(next) }
      if (next === frames) setPlaying(false)
      else animation = requestAnimationFrame(advance)
    }
    animation = requestAnimationFrame(advance)
    return () => cancelAnimationFrame(animation)
  }, [playing, visible, foreground, tabVisible, motion])

  return (
    <section className="timeline-section container section-rule" aria-labelledby="timeline-heading">
      <span className="eyebrow">Inside the edit</span>
      <h2 className="metallic-heading" id="timeline-heading">THE TIMELINE</h2>
      <img className="timeline-cube" src={decorativePath('glass-cube.png')} alt="" loading="lazy" />
      <div className="edit-panel" ref={ref} dir="ltr">
        <div className="edit-bar mono">
          <span className="sequence-label"><i aria-hidden="true" />Sequence 01 · 24 FPS · 4K</span>
          <bdi data-testid="timeline-timecode">{rulerTime(frame)}</bdi>
        </div>
        <div className="edit-scroll" role="region" aria-label="Timeline tracks" tabIndex={0}>
          <div className="edit-grid" style={{ '--playhead': `${frame / frames * 100}%` } as CSSProperties}>
            <div className="edit-ruler" aria-hidden="true" />
            {tracks.map(([id, title, clips], trackIndex) => (
              <div className="edit-track" key={id}>
                <div className="track-label mono">{id} · {title}</div>
                <div className="track-clips">
                  {clips.map(([start, width, label, keys]) => (
                    <div className={`edit-clip clip-${trackIndex} mono`} key={label}
                      data-active={frame / frames * 100 >= start && frame / frames * 100 < start + width}
                      style={{ left: `${start}%`, width: `${width}%` }} title={label}>
                      {trackIndex > 2
                        ? <svg className="clip-wave" viewBox="0 0 104 14" preserveAspectRatio="none" aria-hidden="true"><path d={wave} /></svg>
                        : <span>{label}</span>}
                      {keys.map((key) => <i key={key} style={{ left: `${key}%` }}
                        data-past={frame / frames * 100 >= start + width * key / 100} />)}
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <div className="edit-scrub">
              <div className="edit-playhead" aria-hidden="true" />
              <input aria-label="Scrub illustrative sequence" aria-valuetext={rulerTime(frame)} type="range"
                min={0} max={frames} step={motion ? 24 : 1} value={frame} onPointerDown={() => setPlaying(false)}
                onChange={(event) => { setPlaying(false); setFrame(Number(event.target.value)) }} />
            </div>
          </div>
        </div>
      </div>
      <div className="edit-footer">
        <button className="glass" onClick={() => {
          if (frame === frames) setFrame(0)
          setPlaying(!playing)
        }}>{playing ? 'Ⅱ Pause sequence' : <><PlayIcon /> Play sequence</>}</button>
        <span className="mono">Illustrative sequence<span className="drag-hint">　/　Drag playhead</span></span>
      </div>
    </section>
  )
}

const terms = ['Motion Graphics', 'Color Grading', 'Sound Design', 'Masking', 'Tracking', 'Keyframes', 'After Effects', 'Premiere Pro', 'Editing', 'Transitions', 'Storytelling', 'Timecodes']

export function Marquee() {
  const { ref, visible } = useVisible<HTMLDivElement>()
  const [paused, setPaused] = useState(false)
  return (
    <div className="marquee" ref={ref} data-running={visible && !paused}>
      <button className="glass marquee-motion" onClick={() => setPaused(!paused)}>
        {paused ? 'Resume scrolling terms' : 'Pause scrolling terms'}
      </button>
      <div className="marquee-window">
        <div className="marquee-track">
          {[0, 1].map((copy) => <ul key={copy} aria-hidden={copy === 1 || undefined}>
            {terms.map((term) => <li key={term} className="metallic-heading">{term}</li>)}
          </ul>)}
        </div>
      </div>
    </div>
  )
}
