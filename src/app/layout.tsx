import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { defaultLocale, textDirection } from '../domain/locale'
import { MediaExperience } from '../components/media-experience'
import '../styles/base.css'

export const metadata: Metadata = {
  title: { default: 'ABDELRAHMAN', template: '%s | ABDELRAHMAN' },
  robots: { index: false, follow: false },
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang={defaultLocale} dir={textDirection[defaultLocale]}>
      <body><MediaExperience><a className="skip-link" href="#main">Skip to content</a>{children}</MediaExperience></body>
    </html>
  )
}
