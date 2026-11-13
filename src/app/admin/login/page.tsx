import type { Metadata } from 'next'
import { signIn } from '../actions'
import styles from '../admin.module.css'

export const metadata: Metadata = { title: 'Admin sign-in' }

const errors = {
  credentials: 'Sign-in failed. Check your email and password.',
  denied: 'This account does not have admin access.',
  unavailable: 'Admin sign-in is temporarily unavailable.',
  rate: 'Too many sign-in attempts. Try again in a few minutes.',
  logout: 'This browser’s session was cleared. Supabase could not confirm sign-out.',
} as const

export default async function AdminLogin({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams
  const message = error && Object.hasOwn(errors, error) ? errors[error as keyof typeof errors] : null

  return (
    <>
      <h1>Admin sign-in</h1>
      {message && <p role="alert" className={styles.error}>{message}</p>}
      <form action={signIn} className={styles.form}>
        <label>Email<input name="email" type="email" autoComplete="username" maxLength={254} required /></label>
        <label>Password<input name="password" type="password" autoComplete="current-password" maxLength={4096} required /></label>
        <button className="glass" type="submit">Sign in</button>
      </form>
    </>
  )
}
