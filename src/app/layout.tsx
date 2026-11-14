import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { defaultLocale, textDirection } from '../domain/locale'
import { MediaExperience } from '../components/media-experience'
import { preventIndexing } from '../server/site-metadata'
import '../styles/base.css'

export const metadata: Metadata = {
  title: { default: 'ABDELRAHMAN', template: '%s | ABDELRAHMAN' },
  robots: preventIndexing,
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang={defaultLocale} dir={textDirection[defaultLocale]}>
      <link rel="preload" href="/fonts/archivo-black.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      <body><MediaExperience><a className="skip-link" href="#main">Skip to content</a>{children}</MediaExperience></body>
    </html>
  )
}
