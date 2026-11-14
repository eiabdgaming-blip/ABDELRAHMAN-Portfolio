export function uploadFile(upload: { url: string; fields: Record<string, string> }, file: File, progress: (percent: number) => void) {
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
