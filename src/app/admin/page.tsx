import type { Metadata } from 'next'
import { requireAdmin } from '../../lib/admin-access'
import { signOut } from './actions'

export const metadata: Metadata = { title: 'Admin' }

export default async function AdminPage() {
  const { user } = await requireAdmin()
  return (
    <>
      <h1>Admin dashboard</h1>
      <p>Signed in as {user.email ?? 'owner'}.</p>
      <form action={signOut}><button className="glass" type="submit">Sign out</button></form>
    </>
  )
}
