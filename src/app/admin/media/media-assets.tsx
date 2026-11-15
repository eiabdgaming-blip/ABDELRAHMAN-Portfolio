'use client'

import { useEffect, useRef, useState } from 'react'
import { PublicationForm, type Publication } from './publication-form'
import styles from './media.module.css'

type Asset = Publication & {
  format: string; bytes: number; width: number; height: number; duration: number | null; created_at: string;
}

export function MediaAssets({ assets, canManage, canPublish, posters }: {
  assets: Asset[]; canManage: boolean; canPublish: boolean; posters: { id: string; title: string }[];
}) {
  const [message, setMessage] = useState('')
  const status = useRef<HTMLParagraphElement>(null)
  useEffect(() => { if (message) status.current?.focus() }, [message])

  return <>
    <p ref={status} role="status" tabIndex={-1} hidden={!message}>{message}</p>
    <ul className={styles.grid}>
      {assets.map((asset) => {
        const preview = '/admin/media/preview/' + asset.id
        return <li key={asset.id} className={styles.card}>
          <div className={styles.preview}>
            {asset.resource_type === 'video'
              ? <video src={preview} controls preload="none" aria-label={asset.title} />
              : <img src={preview} alt={asset.title} loading="lazy" />}
          </div>
          <div className={styles.details}>
            <h3>{asset.title}</h3>
            <p><strong className={styles.badge} data-status={asset.status}>{asset.status}</strong> · {asset.format.toUpperCase()} · {(asset.bytes / 1_000_000).toFixed(2)} MB</p>
            <p>{asset.width} × {asset.height}{asset.duration ? ` · ${Number(asset.duration).toFixed(1)} s` : ''}</p>
            <time dateTime={asset.created_at}>{new Date(asset.created_at).toISOString().slice(0, 10)}</time>
            {canManage && <PublicationForm asset={asset} posters={posters} canPublish={canPublish} onDeleted={setMessage} />}
          </div>
        </li>
      })}
    </ul>
  </>
}
