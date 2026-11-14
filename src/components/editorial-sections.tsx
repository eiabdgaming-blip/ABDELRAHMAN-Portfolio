'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { profileFields, profileKeys, profilePattern, publicPlayerItem, type PublicFeedback } from '../domain/portfolio-cms'
import { FeedbackVoice } from './feedback-voice'
import { FeedbackQuote } from './feedback-quote'
import { ProfileIcon } from './profile-icon'
import { reviewMedia } from '../domain/display'
import { projectTypes } from '../domain/editorial'
import type { Question, Service, SiteContact } from '../domain/site-content'
import { ownerEmailLink, ownerSocialLinks } from '../domain/contact'
import { leadFieldsList, phonePattern, validateLead, type LeadField } from '../domain/leads'
import { AmbientMedia } from './ambient'
import { PlayIcon } from './icons'
import { useMediaExperience } from './media-experience'

export function Services({ services }: { services: readonly Service[] }) {
  return (
    <section id="services" className="services" tabIndex={-1} aria-labelledby="services-heading">
      <div className="editorial-container">
        <h2 className="metallic-heading" id="services-heading">SERVICES</h2>
        <ol>
          {services.map(([id, title, copy], i) => (
            <li key={id}>
              <span className="service-number" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
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

export function FAQ({ questions }: { questions: readonly Question[] }) {
  const [open, setOpen] = useState<string | null>(questions[0]?.id ?? null)
  return (
    <section id="faq" className="faq editorial-container" tabIndex={-1} aria-labelledby="faq-heading">
      <h2 className="metallic-heading" id="faq-heading">FAQ</h2>
      {questions.map(({ id, question, answer }, i) => (
        <div className="faq-row" key={id}>
          <h3>
            <button type="button" id={`faq-q-${i}`} aria-expanded={open === id} aria-controls={`faq-a-${i}`}
              onClick={() => setOpen(open === id ? null : id)}>
              {question}<span className="glass" aria-hidden="true">{open === id ? '−' : '+'}</span>
            </button>
          </h3>
          <p id={`faq-a-${i}`} aria-labelledby={`faq-q-${i}`} hidden={open !== id}>{answer}</p>
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

export function Contact({ review, selectedService, services, contact }: {
  review: boolean; selectedService: string; services: readonly Service[]; contact: SiteContact
}) {
  const [enabled, setEnabled] = useState(false)
  const [error, setError] = useState('')
  const [errors, setErrors] = useState<Partial<Record<LeadField, string>>>({})
  const [phase, setPhase] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [receipt, setReceipt] = useState<{ whatsapp: string; email: string }>()
  const saving = useRef(false)
  const retry = useRef<{ payload: string; token: string }>(undefined)
  const successLink = useRef<HTMLAnchorElement>(null)
  const [service, setService] = useState(selectedService)
  const [format, setFormat] = useState('')
  useEffect(() => setEnabled(true), [])
  useEffect(() => { if (phase === 'saved') successLink.current?.focus({ preventScroll: true }) }, [phase])
  const field = (key: LeadField) => ({
    'aria-invalid': errors[key] ? true as const : undefined,
    'aria-describedby': errors[key] ? `contact-error-${key}` : undefined,
  })
  const hint = (key: LeadField) => errors[key] && <span className="form-error" id={`contact-error-${key}`} role="alert">{errors[key]}</span>
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
              {['video-editing', 'motion-vfx'].map((id) => {
                const item = services.find(([key]) => key === id)
                return item && <button key={id} className="glass" onClick={() => setService(id)}>{item[1]}</button>
              })}
              <button className="glass" onClick={() => setFormat('reels')}>Reels &amp; Shorts</button>
              <button className="glass" onClick={() => setFormat('long-form')}>Long-form</button>
            </div>
            <Illustration review={review} />
          </div>
        </div>
        <form className="contact-form" method="post" aria-busy={phase === 'saving'} noValidate onChange={(event) => {
          const target: EventTarget = event.target
          if ((target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement) &&
            leadFieldsList.includes(target.name as LeadField)) setErrors((previous) => ({ ...previous, [target.name]: undefined }))
          setError('')
        }}
          onSubmit={async (event) => {
            event.preventDefault()
            if (saving.current || phase === 'saved') return
            const form = event.currentTarget
            const data = Object.fromEntries(new FormData(form))
            const checked = validateLead(data)
            if (services.length && !services.some(([key]) => key === checked.values.serviceId)) checked.errors.serviceId = 'Choose a service.'
            const showErrors = (issues: typeof errors) => {
              setErrors(issues)
              const first = leadFieldsList.find((key) => issues[key])
              if (first) (form.elements.namedItem(first) as HTMLElement | null)?.focus()
            }
            if (Object.keys(checked.errors).length) { showErrors(checked.errors); return }
            saving.current = true
            setPhase('saving')
            setError('')
            setErrors({})
            let saved = false
            try {
              const payload = JSON.stringify(checked.values)
              if (retry.current?.payload !== payload) {
                const uuid = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() :
                  Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0'))
                    .join('').replace(/^(........)(....)(....)(....)(............)$/, '$1-$2-$3-$4-$5')
                retry.current = { payload, token: uuid }
              }
              const result = await fetch('/api/contact', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...checked.values, website: data.website ?? '', token: retry.current.token }),
                signal: AbortSignal.timeout(12000),
              })
              const reply = await result.json()
              if (result.ok && typeof reply.whatsapp === 'string' && typeof reply.email === 'string') {
                saved = true
                setReceipt(reply)
                setPhase('saved')
              } else if (reply.errors) showErrors(reply.errors)
              else setError(reply.message || 'The inquiry could not be saved. Please try again.')
            } catch { setError('Saving could not be confirmed. Retry safely or use the email link.') }
            finally { saving.current = false; if (!saved) setPhase('idle') }
          }}>
          <div hidden><label>Leave blank<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
          <div className="form-pair contact-name">
            <label>Name *<input name="name" autoComplete="name" placeholder="Your name" required maxLength={100} {...field('name')} />{hint('name')}</label>
            <label>Project type *<select name="projectTypeId" value={format} onChange={(event) => setFormat(event.target.value)} required {...field('projectTypeId')}>
              <option value="">Select project type</option>
              {projectTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>{hint('projectTypeId')}</label>
          </div>
          <label>Service{services.length ? ' *' : ''}<select name="serviceId" value={service} onChange={(event) => setService(event.target.value)} required={!!services.length} disabled={!services.length} {...field('serviceId')}>
            <option value="">Select a service</option>
            {services.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>{hint('serviceId')}</label>
          <label>Project brief *<textarea name="brief" placeholder="Goals, footage and deliverables" required maxLength={3000} rows={3} {...field('brief')} />{hint('brief')}</label>
          <div className="form-pair">
            <label>Budget<input name="budget" placeholder="Optional" maxLength={100} {...field('budget')} />{hint('budget')}</label>
            <label>Deadline<input name="deadline" placeholder="Optional" maxLength={100} {...field('deadline')} />{hint('deadline')}</label>
          </div>
          <div className="form-pair contact-channels">
            <label>Email<input type="email" name="email" placeholder="Email address" autoComplete="email" maxLength={254}
              {...field('email')} aria-describedby={errors.email ? 'reply-hint contact-error-email' : 'reply-hint'} />{hint('email')}</label>
            <label>WhatsApp phone<input type="tel" name="whatsapp" placeholder="Include country code" autoComplete="tel" maxLength={16}
              pattern={phonePattern.source.slice(1, -1)} {...field('whatsapp')}
              aria-describedby={errors.whatsapp ? 'reply-hint contact-error-whatsapp' : 'reply-hint'} />{hint('whatsapp')}</label>
          </div>
          <p id="reply-hint" className="form-hint">Add at least one valid reply channel.</p>
          {error && <p className="form-error" role="alert">{error}</p>}
          {receipt ? <>
            <p className="form-hint" role="status">Inquiry saved. Open WhatsApp to review and send your message.</p>
            <a ref={successLink} className="whatsapp glass" href={receipt.whatsapp}>Continue on WhatsApp ↗</a>
          </> : <button type="submit" className="whatsapp glass" disabled={!enabled || phase === 'saving'}>
            {phase === 'saving' ? 'Saving inquiry…' : 'Save inquiry & continue ↗'}
          </button>}
          <p className="form-hint whatsapp-hint"><a href={receipt?.email ?? ownerEmailLink(contact.email)}>Contact by email</a></p>
          <div className="form-pair social-links">
            {ownerSocialLinks(contact).map(({ label, href }) => <a className="glass" key={href} href={href} target="_blank" rel="noopener noreferrer">{label} ↗</a>)}
          </div>
        </form>
      </div>
    </section>
  )
}

export function Footer({ contact }: { contact: SiteContact }) {
  return (
    <footer className="site-footer container">
      <div className="footer-meta">
        <span className="eyebrow">Video Editor &amp; Motion Designer</span>
        <div className="footer-links">
          {ownerSocialLinks(contact).map(({ label, href }) => <a className="glass" key={href} href={href} target="_blank" rel="noopener noreferrer">{label}</a>)}
          <a className="glass" href={ownerEmailLink(contact.email)}>Email</a>
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

function Testimonial({ entry }: { entry: PublicFeedback }) {
  const { showProof, showVideo } = useMediaExperience()
  const profiles = profileKeys.flatMap((key) => {
    const network = profileFields[key]
    const host = network.toLowerCase() + '.com'
    const href = [entry[key], entry.profile_url].find((value) => value && profilePattern.test(value) &&
      new URL(value).hostname.replace(/^www\./, '') === host)
    return href ? [{ network, href }] : []
  })
  const [primary, ...secondary] = profiles
  const badge = ({ network, href }: typeof profiles[number], overlap = false) =>
    <a key={network} className="feedback-social" data-platform={network} data-primary={overlap || undefined}
      href={href} target="_blank" rel="noopener noreferrer" aria-label={`${entry.client_name} on ${network}`}>
      <ProfileIcon platform={network} />
    </a>
  return <article className="feedback-card feedback-testimonial">
    <header>
      <div className="feedback-avatar-wrap">
        {entry.avatar ? <img className="feedback-avatar" src={entry.avatar} alt="" width={44} height={44} loading="lazy" />
          : <span className="feedback-avatar mono" aria-hidden="true">{Array.from(entry.client_name)[0]}</span>}
        {primary && badge(primary, true)}
      </div>
      <div className="feedback-identity">
        <h3 dir="auto">{entry.client_name}</h3>
        {entry.affiliation && <p dir="auto">{entry.affiliation}</p>}
        {!!secondary.length && <div className="feedback-profiles">{secondary.map((profile) => badge(profile))}</div>}
      </div>
    </header>
    <FeedbackQuote text={entry.quote} />
    {!!entry.services.length && <div className="feedback-tags">{entry.services.map((tag, index) => <span className="feedback-tag" key={index}>{tag}</span>)}</div>}
    {entry.proof && (
      <button type="button" className="proof-image" aria-label="View approved chat screenshot" onClick={(event) =>
        showProof('Approved chat screenshot', <img className="proof-image-expanded" src={entry.proof!} alt="Approved chat screenshot" />, event.currentTarget)}>
        <img src={entry.proof} alt="Approved chat screenshot" loading="lazy" />
      </button>
    )}
    {!!entry.voice_duration && <FeedbackVoice key={entry.id} id={entry.id} duration={entry.voice_duration} />}
    {entry.work_title && entry.work_poster && <div className="feedback-work">
      {entry.work_slug ? <Link className="feedback-work-link" href={'/work/' + entry.work_slug}>
        <img src={entry.work_poster} alt="" loading="lazy" /><strong>{entry.work_title} ↗</strong>
      </Link> : entry.work_video ? <button type="button" className="feedback-work-link" onClick={(event) =>
        showVideo([publicPlayerItem(entry.work_video!, entry.work_title!, entry.work_poster!)], 0, event.currentTarget)}>
        <img src={entry.work_poster} alt="" loading="lazy" /><strong><PlayIcon />{entry.work_title}</strong>
      </button> : <><img src={entry.work_poster} alt="" loading="lazy" /><strong>{entry.work_title}</strong></>}
    </div>}
  </article>
}

export function Feedback({ review, entries }: { review: boolean; entries: PublicFeedback[] }) {
  const [filter, setFilter] = useState<Filter>('All')
  const [sort, setSort] = useState('newest')
  const { showProof, claimAudio } = useMediaExperience()
  const [playing, setPlaying] = useState(false)
  const fixtures = review && !entries.length
  const tone = useRef<{ stop: () => void }>(undefined)
  useEffect(() => () => tone.current?.stop(), [])
  const visible = examples.filter(({ featured, id }) => filter === 'All' || (filter === 'Featured' && featured)
    || (filter === 'With proof' && id !== 'post'))
  const testimonials = entries.filter((entry) => filter === 'All' || filter === 'With review' ||
    (filter === 'Featured' && entry.featured) || (filter === 'With proof' && !!(entry.proof || entry.voice_duration)))
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
    <section id="feedback" className="feedback container" tabIndex={-1} aria-labelledby="feedback-heading" data-empty={!fixtures && !entries.length}>
      <div className="section-intro">
        <span className="eyebrow">Clients &amp; collaborations</span>
        <h2 className="metallic-heading" id="feedback-heading">CLIENT FEEDBACK</h2>
        <p className="section-copy">Feedback, project context and original posts.</p>
      </div>
      {(fixtures || entries.length > 0) && <>
      <div className="feedback-controls">
        <div aria-label="Feedback filters">
          {(['All', 'Featured', 'With review', 'With proof'] as const).map((choice) =>
            <button key={choice} className="glass" aria-pressed={filter === choice} onClick={() => {
              if (choice !== 'All' && choice !== 'With proof') tone.current?.stop()
              setFilter(choice)
            }}>{choice}</button>)}
        </div>
        {fixtures && <select className="glass" aria-label="Sort feedback" value={sort} onChange={(event) => setSort(event.target.value)}>
          <option value="newest">Newest</option><option value="oldest">Oldest</option>
        </select>}
      </div>
      <div className={fixtures ? 'feedback-grid' : 'feedback-wall'}>
        {testimonials.map((entry) => <Testimonial key={entry.id} entry={entry} />)}
        {fixtures && visible.map(({ id, type, summary }) => (
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
      {!(fixtures ? visible.length : testimonials.length) && <p className="empty-state" role="status">No approved client reviews are available.</p>}
    </section>
  )
}
