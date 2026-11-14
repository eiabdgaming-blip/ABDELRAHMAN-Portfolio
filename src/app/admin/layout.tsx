import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import styles from './admin.module.css'

export const metadata: Metadata = { robots: { index: false, follow: false } }

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <main id="main" className={styles.shell} tabIndex={-1}>{children}</main>
}
