'use client'

import { useEffect, useRef, useState } from 'react'
import { reviewMedia } from '../domain/display'
import { projectTypes, questions, services } from '../domain/editorial'
import { ownerEmailLink, ownerSocialLinks, whatsappDraft } from '../domain/contact'
import { AmbientMedia } from './ambient'
import { PlayIcon } from './icons'
import { useMediaExperience } from './media-experience'

export function Services() {
  return (
    <section id="services" className="services" tabIndex={-1} aria-labelledby="services-heading">
      <div className="editorial-container">
        <h2 className="metallic-heading" id="services-heading">SERVICES</h2>
        <ol>
          {services.map(([id, title, copy], i) => (
            <li key={id}>
              <span className="service-number" aria-hidden="true">0{i + 1}</span>
              <h3>{title}</h3><p>{copy}</p>
              <a className="service-link" aria-label={`Ask about ${title}`} href={`/?service=${id}#contact`}>↗</a>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

export function About({ review }: { review: boolean }) {
  return (
    <section className="about editorial-container" aria-labelledby="about-heading" data-ambient-section>
      <div className="about-copy">
        <span className="eyebrow">About me</span>
        <h2 className="metallic-heading" id="about-heading">INSIDE THE EDIT</h2>
        <p>I'm Abdelrahman, a Video Editor &amp; Motion Designer. I help brands and creators transform their ideas into engaging visual experiences, combining creative storytelling with thoughtful motion and attention to detail.</p>
      </div>
      {review && <div className="about-art" aria-hidden="true">
        <AmbientMedia id="disk" priority={4} className="about-disk" />
        <img className="about-moon" src={reviewMedia('moon')} alt="" loading="lazy" />
      </div>}
    </section>
  )
}

export function FAQ({ review }: { review: boolean }) {
  const [open, setOpen] = useState<number | null>(0)
  return (
    <section id="faq" className="faq editorial-container" tabIndex={-1} aria-labelledby="faq-heading">
      <h2 className="metallic-heading" id="faq-heading">FAQ</h2>
      {(review ? questions : questions.slice(0, 1)).map(([question, answer], i) => (
        <div className="faq-row" key={question}>
          <h3>
            <button type="button" id={`faq-q-${i}`} aria-expanded={open === i} aria-controls={`faq-a-${i}`}
              onClick={() => setOpen(open === i ? null : i)}>
              {question}<span className="glass" aria-hidden="true">{open === i ? '−' : '+'}</span>
            </button>
          </h3>
          <p id={`faq-a-${i}`} aria-labelledby={`faq-q-${i}`} hidden={open !== i}>{answer}</p>
        </div>
      ))}
    </section>
  )
}

function Illustration({ review }: { review: boolean }) {
  return (
    <div className="contact-illustration" aria-hidden="true">
      <div className="illustration-monitor">
        <span className="round-play glass"><PlayIcon /></span>
        {review && <img src={reviewMedia('cursor')} alt="" loading="lazy" />}
      </div>
      <div className="illustration-timeline"><i /><i /><i /><b /></div>
      <span className="mono">Editorial illustration</span>
    </div>
  )
}

export function Contact({ review, selectedService }: { review: boolean; selectedService: string }) {
  const [enabled, setEnabled] = useState(false)
  const [error, setError] = useState('')
  const email = useRef<HTMLInputElement>(null)
  const phone = useRef<HTMLInputElement>(null)
  const [service, setService] = useState(selectedService)
  const [format, setFormat] = useState('')
  useEffect(() => setEnabled(true), [])
  return (
    <section id="contact" className="contact" tabIndex={-1} aria-labelledby="contact-heading" data-ambient-section>
      <div className="section-intro">
        <span className="eyebrow">Contact</span>
        <h2 className="metallic-heading" id="contact-heading">LET'S WORK TOGETHER</h2>
        <p className="section-copy">Tell me what you want to make.</p>
      </div>
      <div className="contact-panel">
        <div className="contact-intro">
          {review && <div className="contact-star-zone" aria-hidden="true">
            <AmbientMedia id="contact-star" priority={3} className="contact-star" desktopOnly />
          </div>}
          <div className="contact-intro-content">
            <h3>Tell me about<br /><span>your project</span></h3>
            <p>Share the project goals, footage and deliverables. I’ll reply using the contact details you provide.</p>
            <div className="contact-tags">
              <button className="glass" onClick={() => setService('video-editing')}>Video Editing</button>
              <button className="glass" onClick={() => setService('motion-vfx')}>Motion &amp; VFX</button>
              <button className="glass" onClick={() => setFormat('reels')}>Reels &amp; Shorts</button>
              <button className="glass" onClick={() => setFormat('long-form')}>Long-form</button>
            </div>
            <Illustration review={review} />
          </div>
        </div>
        <form className="contact-form" method="post" onChange={() => { if (error) setError('') }}
          onSubmit={(event) => {
            event.preventDefault()
            const data = new FormData(event.currentTarget)
            for (const [field, message] of [['name', 'Enter your name.'], ['brief', 'Enter a project brief.']]) {
              if (!String(data.get(field) ?? '').trim()) {
                const control = event.currentTarget.elements.namedItem(field) as HTMLInputElement | HTMLTextAreaElement
                control.setCustomValidity(message)
                control.reportValidity()
                return
              }
            }
            if (!email.current?.value.trim() && !phone.current?.value.trim()) {
              setError('Add a valid email address or WhatsApp phone number.')
              email.current?.focus()
              return
            }
            const value = (field: string) => String(data.get(field) ?? '').trim()
            const projectType = projectTypes.find(([key]) => key === format)?.[1]
            const serviceName = services.find(([key]) => key === service)?.[1]
            if (!projectType || !serviceName) return
            window.location.assign(whatsappDraft([
              ['Name', value('name')], ['Project type', projectType], ['Service', serviceName],
              ['Project brief', value('brief')], ['Budget', value('budget')], ['Deadline', value('deadline')],
              ['Email', value('email')], ['WhatsApp phone', value('whatsapp')],
            ]))
          }}>
          <div className="form-pair contact-name">
            <label>Name *<input name="name" autoComplete="name" placeholder="Your name" required maxLength={100}
              onInput={(event) => event.currentTarget.setCustomValidity('')} /></label>
            <label>Project type *<select name="projectTypeId" value={format} onChange={(event) => setFormat(event.target.value)} required>
              <option value="">Select project type</option>
              {projectTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select></label>
          </div>
          <label>Service *<select name="serviceId" value={service} onChange={(event) => setService(event.target.value)} required>
            <option value="">Select a service</option>
            {services.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select></label>
          <label>Project brief *<textarea name="brief" placeholder="Goals, footage and deliverables" required maxLength={3000} rows={3}
            onInput={(event) => event.currentTarget.setCustomValidity('')} /></label>
          <div className="form-pair">
            <label>Budget<input name="budget" placeholder="Optional" maxLength={100} /></label>
            <label>Deadline<input name="deadline" placeholder="Optional" maxLength={100} /></label>
          </div>
          <div className="form-pair contact-channels">
            <label>Email<input ref={email} type="email" name="email" placeholder="Email address" autoComplete="email"
              aria-invalid={!!error || undefined} aria-describedby="reply-hint" /></label>
            <label>WhatsApp phone<input ref={phone} type="tel" name="whatsapp" placeholder="Include country code" autoComplete="tel"
              pattern={'\\+[1-9][0-9]{7,14}'} aria-invalid={!!error || undefined} aria-describedby="reply-hint" /></label>
          </div>
          <p id="reply-hint" className={error ? 'form-error' : 'form-hint'} role={error ? 'alert' : undefined}>{error || 'Add at least one valid reply channel.'}</p>
          <button type="submit" className="whatsapp glass" disabled={!enabled}>Continue on WhatsApp ↗</button>
          <p className="form-hint whatsapp-hint">Review and send your draft in WhatsApp.</p>
          <div className="form-pair social-links">
            {ownerSocialLinks.map(({ label, href }) => <a className="glass" key={href} href={href} target="_blank" rel="noopener noreferrer">{label} ↗</a>)}
          </div>
        </form>
      </div>
    </section>
  )
}

export function Footer() {
  return (
    <footer className="site-footer container">
      <div className="footer-meta">
        <span className="eyebrow">Video Editor &amp; Motion Designer</span>
        <div className="footer-links">
          {ownerSocialLinks.map(({ label, href }) => <a className="glass" key={href} href={href} target="_blank" rel="noopener noreferrer">{label}</a>)}
          <a className="glass" href={ownerEmailLink}>Email</a>
        </div>
      </div>
      <div className="footer-wordmark" data-text="ABDELRAHMAN" aria-hidden="true">ABDELRAHMAN</div>
    </footer>
  )
}

const examples = [
  { id: 'chat', type: 'WhatsApp capture', summary: 'Screenshot placeholder', featured: true },
  { id: 'voice', type: 'Voice note', summary: 'Synthetic audio sample', featured: false },
  { id: 'post', type: 'Published post proof', summary: 'Thumbnail placeholder', featured: false },
] as const
type Filter = 'All' | 'Featured' | 'With review' | 'With proof'

export function Feedback({ review }: { review: boolean }) {
  const [filter, setFilter] = useState<Filter>('All')
  const [sort, setSort] = useState('newest')
  const { showProof, claimAudio } = useMediaExperience()
  const [playing, setPlaying] = useState(false)
  const tone = useRef<{ stop: () => void }>(undefined)
  useEffect(() => () => tone.current?.stop(), [])
  const visible = examples.filter(({ featured, id }) => filter === 'All' || (filter === 'Featured' && featured)
    || (filter === 'With proof' && id !== 'post'))
  if (sort === 'oldest') visible.reverse()

  async function playSample() {
    if (tone.current) { tone.current.stop(); return }
    const audio = new AudioContext()
    const oscillator = audio.createOscillator()
    const gain = audio.createGain()
    oscillator.frequency.value = 294
    gain.gain.value = .04
    oscillator.connect(gain).connect(audio.destination)
    const stop = () => {
      if (tone.current?.stop !== stop) return
      tone.current = undefined
      release()
      setPlaying(false)
      void audio.close()
    }
    const release = claimAudio(stop)
    tone.current = { stop }
    try {
      await audio.resume()
      if (!tone.current || audio.state === 'closed') return
      oscillator.onended = stop
      oscillator.start()
      oscillator.stop(audio.currentTime + 1.6)
      setPlaying(true)
    } catch { stop() }
  }

  return (
    <section id="feedback" className="feedback container" tabIndex={-1} aria-labelledby="feedback-heading" data-empty={!review}>
      <div className="section-intro">
        <span className="eyebrow">Clients &amp; collaborations</span>
        <h2 className="metallic-heading" id="feedback-heading">CLIENT FEEDBACK</h2>
        <p className="section-copy">Feedback, project context and original posts.</p>
      </div>
      {review && <>
      <div className="feedback-controls">
        <div aria-label="Feedback filters">
          {(['All', 'Featured', 'With review', 'With proof'] as const).map((choice) =>
            <button key={choice} className="glass" aria-pressed={filter === choice} onClick={() => {
              if (choice !== 'All' && choice !== 'With proof') tone.current?.stop()
              setFilter(choice)
            }}>{choice}</button>)}
        </div>
        <select className="glass" aria-label="Sort feedback" value={sort} onChange={(event) => setSort(event.target.value)}>
          <option value="newest">Newest</option><option value="oldest">Oldest</option>
        </select>
      </div>
      <div className="feedback-grid">
        {visible.map(({ id, type, summary }) => (
          <article className="feedback-card" key={id}>
            <header><span className="feedback-avatar mono" aria-hidden="true">Photo</span>
              <div><h3>Client name</h3><p>Role / collaboration</p></div></header>
            <div className="feedback-quote">
              <span className="eyebrow">Review placeholder</span>
              <p>Approved client feedback will appear here.</p>
            </div>
            <span className="feedback-tag">Project type</span>
            <div className={`feedback-proof proof-${id}`}>
              {id === 'chat' && <button className="glass proof-action" aria-label="Zoom WhatsApp proof placeholder"
                onClick={(event) => showProof('WhatsApp capture placeholder',
                  <div className="proof-placeholder"><p>No client content in this local example.</p><span>Redacted proof area</span><span>Screenshot placeholder</span></div>,
                  event.currentTarget)}>⤢</button>}
              {id === 'voice' && <button className="glass proof-action" aria-label={playing ? 'Pause audio sample' : 'Play audio sample'} onClick={playSample}>
                {playing ? 'Ⅱ' : <PlayIcon />}
              </button>}
              <strong>{type}</strong><small>{summary}</small>
              {id === 'voice' && <details><summary>Transcript</summary><p>A short synthetic tone. No speech or client recording.</p></details>}
            </div>
          </article>
        ))}
      </div>
      </>}
      {(!review || !visible.length) && <p className="empty-state" role="status">No approved client reviews are available.</p>}
    </section>
  )
}
