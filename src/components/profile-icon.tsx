export function ProfileIcon({ platform }: { platform: 'Instagram' | 'TikTok' | 'LinkedIn' }) {
  return <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
    {platform === 'Instagram' ? <>
      <rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="17.5" cy="6.5" r="1.2" fill="currentColor" />
    </> : platform === 'TikTok' ? <path fill="currentColor" d="M16.6 2c.4 2.6 1.9 4.1 4.4 4.3v3.6a9 9 0 0 1-4.4-1.4v6.7a6.8 6.8 0 1 1-6.8-6.8c.4 0 .8 0 1.2.1v3.7a3.3 3.3 0 1 0 2 3V2z" />
    : <path fill="currentColor" d="M5 3a2 2 0 1 1 0 4 2 2 0 0 1 0-4ZM3.4 9h3.3v12H3.4zM9 9h3.2v1.6a4 4 0 0 1 3.6-1.9c3.5 0 4.5 2.1 4.5 5V21H17v-6.5c0-1.6-.4-2.8-2.1-2.8-1.8 0-2.5 1.3-2.5 3V21H9z" />}
  </svg>
}
