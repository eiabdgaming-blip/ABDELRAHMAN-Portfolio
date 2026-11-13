'use client'

import { useRef, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { validateFile } from '../../../lib/media/formats'
import { saveUpload, signUpload } from './actions'
import styles from './media.module.css'

type SignedUpload = NonNullable<Awaited<ReturnType<typeof signUpload>>['upload']>

function uploadFile(upload: SignedUpload, file: File, progress: (percent: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', upload.url)
    xhr.timeout = 600_000
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) progress(Math.round(100 * event.loaded / event.total))
    }
    xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() :
      reject(new Error('Cloudinary rejected the upload. Check the file format, size and account limits.'))
    xhr.onerror = xhr.ontimeout = () => reject(new Error('The upload connection was interrupted.'))
    const body = new FormData()
    for (const [key, value] of Object.entries(upload.fields)) body.append(key, value)
    body.append('file', file)
    xhr.send(body)
  })
}

export function UploadForm({ ready }: { ready: boolean }) {
  const router = useRouter()
  const form = useRef<HTMLFormElement>(null)
  const running = useRef(false)
  const [stage, setStage] = useState('')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [retry, setRetry] = useState('')

  async function save(ticket: string) {
    setStage('Verifying and saving…')
    const result = await saveUpload(ticket)
    if ('error' in result) {
      setError(result.error)
      return
    }
    setRetry('')
    setSuccess('Media saved as Draft.')
    form.current?.reset()
    router.refresh()
  }

  async function run(operation: () => Promise<void>) {
    if (running.current) return
    running.current = true
    setError('')
    setSuccess('')
    try {
      await operation()
    } catch {
      setError('The request could not be completed. Check your connection and try again.')
    } finally {
      running.current = false
      setStage('')
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const file = data.get('file')
    const title = data.get('title')
    if (!(file instanceof File) || typeof title !== 'string') return
    void run(async () => {
      try {
        validateFile(file.name, file.size, file.type)
      } catch (reason) {
        setError((reason as Error).message)
        return
      }
      setStage('Authorizing upload…')
      const signed = await signUpload({ name: file.name, size: file.size, mime: file.type, title })
      if (!signed.upload) {
        setError(signed.error)
        return
      }
      setProgress(0)
      setStage('Uploading to Cloudinary…')
      try {
        await uploadFile(signed.upload, file, setProgress)
      } catch (reason) {
        setRetry(signed.upload.ticket)
        setError((reason as Error).message + ' If Cloudinary received the file, try saving it again.')
        return
      }
      setRetry(signed.upload.ticket)
      await save(signed.upload.ticket)
    })
  }

  return (
    <form ref={form} className={styles.upload} onSubmit={submit}>
      <h2>Upload media</h2>
      <label>Title<input name="title" maxLength={120} required disabled={!ready || !!stage || !!retry} /></label>
      <label>File<input name="file" type="file" accept=".jpg,.jpeg,.png,.webp,.mp4,.webm" required disabled={!ready || !!stage || !!retry} /></label>
      <p className={styles.hint}>JPEG, PNG or WebP up to 10 MB. MP4 or WebM up to 100 MB.</p>
      <div className={styles.actions}>
        {retry ? <>
          <button type="button" className="glass" disabled={!!stage} onClick={() => void run(() => save(retry))}>Retry saving</button>
          <button type="button" className="glass" disabled={!!stage} onClick={() => { setRetry(''); setError('') }}>Start another upload</button>
        </> : <button className="glass" disabled={!ready || !!stage}>Upload draft</button>}
      </div>
      {stage && <p role="status">{stage}</p>}
      {stage.startsWith('Uploading') && <progress max={100} value={progress} aria-label="Upload progress" />}
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {success && <p role="status">{success}</p>}
    </form>
  )
}
