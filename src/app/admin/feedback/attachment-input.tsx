'use client'

import { useEffect, useId, useState } from 'react'
import { uploadFile } from '../../../lib/media/upload-file'
import { formats, validateFile } from '../../../lib/media/formats'
import { voiceFormat, voiceHeader } from '../../../lib/media/voice-format'
import { signUpload, saveUpload } from '../media/actions'
import { signVoiceUpload, saveVoiceUpload } from './upload-actions'
import styles from '../admin.module.css'

type Option = { id: string; title: string; status?: string; duration?: number }
type Props = {
  name: string; label: string; uploadLabel: string; options: Option[]; value: string;
  onChange: (value: string) => void; audio?: boolean;
}

export function AttachmentInput({ name, label, uploadLabel, options, value, onChange, audio = false }: Props) {
  const selectId = useId()
  const [uploaded, setUploaded] = useState<Option[]>([])
  const [local, setLocal] = useState<File>()
  const [preview, setPreview] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState<{ ticket: string; title: string }>()
  const choices = [...uploaded, ...options.filter(({ id }) => !uploaded.some((option) => option.id === id))]
  useEffect(() => {
    const url = local ? URL.createObjectURL(local) : ''
    setPreview(url)
    return () => { if (url) URL.revokeObjectURL(url) }
  }, [local])

  async function save(ticket: string, title: string) {
    const saved = await (audio ? saveVoiceUpload(ticket) : saveUpload(ticket))
    if ('error' in saved) throw new Error(saved.error)
    const duration = 'duration' in saved && typeof saved.duration === 'number' ? saved.duration : undefined
    setUploaded((list) => list.some(({ id }) => id === saved.id) ? list : [...list, { id: saved.id, title, status: 'draft', duration }])
    if (audio) setLocal(undefined)
    onChange(saved.id)
    setRetry(undefined)
  }

  async function run(operation: () => Promise<void>) {
    setBusy(true)
    setError('')
    try { await operation() }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Upload failed. Please retry.') }
    finally { setBusy(false) }
  }

  function choose(file: File) {
    setRetry(undefined)
    void run(async () => {
      if (!audio && formats[validateFile(file.name, file.size, file.type)].resource !== 'image') throw new Error('Choose a JPEG, PNG or WebP image.')
      if (audio) {
        const format = voiceFormat({ name: file.name, size: file.size, mime: file.type })
        if (!format) throw new Error('Choose an MP3, WAV or OGG audio file up to 10 MB.')
        if (!voiceHeader(new Uint8Array(await file.slice(0, 512).arrayBuffer()), format)) {
          throw new Error('This file is not a supported audio recording. Choose an MP3, WAV or OGG (Opus or Vorbis).')
        }
      }
      const title = file.name.trim().slice(0, 120) || label
      if (!audio) setLocal(file)
      setProgress(0)
      onChange('')
      const input = { name: file.name, size: file.size, mime: file.type, title }
      const result = await (audio ? signVoiceUpload(input) : signUpload(input))
      if (!result.upload) throw new Error(result.error)
      await uploadFile(result.upload, file, setProgress)
      setRetry({ ticket: result.upload.ticket, title })
      await save(result.upload.ticket, title)
    })
  }

  const source = preview || (value ? (audio ? '/admin/feedback/voice/' : '/admin/media/preview/') + value : '')
  const duration = choices.find((option) => option.id === value)?.duration
  return <div className={styles.feedbackAttachment}>
    <label htmlFor={selectId}>{label}</label>
    <select id={selectId} name={name} value={value} disabled={busy} onChange={(event) => {
      setLocal(undefined); setRetry(undefined); setError(''); onChange(event.target.value)
    }}>
      <option value="">None</option>
      {value && !choices.some(({ id }) => id === value) && <option value={value}>Previously selected</option>}
      {choices.map(({ id, title, status }) => <option key={id} value={id}>{title}{status ? ' · ' + status : ''}</option>)}
    </select>
    <label>{uploadLabel}<input type="file" disabled={busy} accept={audio ? '.mp3,.wav,.ogg,audio/ogg,application/ogg' : '.jpg,.jpeg,.png,.webp'}
      onChange={(event) => {
        const file = event.currentTarget.files?.[0]
        event.currentTarget.value = ''
        if (file) choose(file)
      }} /></label>
    {source && (audio ? <audio key={source} controls preload="none" src={source} aria-label="Voice note preview" />
      : <img src={source} alt={label + ' preview'} loading="lazy" />)}
    {audio && duration !== undefined && <span role="status">Recording ready · {Math.floor(duration / 60)}:{String(Math.floor(duration % 60)).padStart(2, '0')}</span>}
    <div className={styles.controls}>
      {source && <button className="glass" type="button" disabled={busy} onClick={() => {
        setLocal(undefined); setRetry(undefined); setError(''); onChange('')
      }}>Remove {label.toLowerCase()}</button>}
      {retry && <button className="glass" type="button" disabled={busy}
        onClick={() => void run(() => save(retry.ticket, retry.title))}>Retry saving</button>}
    </div>
    {busy && <progress data-attachment-upload max={100} value={progress} aria-label={uploadLabel + ' progress'} />}
    {!busy && error && <p role="alert" className={styles.error}>{error}</p>}
  </div>
}
