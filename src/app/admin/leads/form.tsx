'use client'

import { startTransition, useActionState, useId } from 'react'
import { leadStatuses } from '../../../domain/leads'
import styles from '../admin.module.css'
import { updateLead, type LeadUpdate } from './actions'

const initial: LeadUpdate = { message: '' }

export function LeadForm({ id, status, notes, updatedAt }: { id: string; status: string; notes: string; updatedAt: string }) {
  const [state, action, pending] = useActionState(updateLead.bind(null, id, updatedAt), initial)
  const statusId = useId()
  return <form className={styles.editor} method="post" onSubmit={(event) => {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    startTransition(() => action(fields))
  }}>
    <fieldset disabled={pending}>
      <label htmlFor={statusId}>Status</label><select id={statusId} name="status" defaultValue={status}>
        {Object.entries(leadStatuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select>
      <label>Private owner notes<textarea name="notes" defaultValue={notes} maxLength={4000} rows={4} /></label>
      <button className="glass" type="submit">{pending ? 'Saving…' : 'Save changes'}</button>
    </fieldset>
    {state.message && <p role={state.ok ? 'status' : 'alert'}>{state.message}</p>}
  </form>
}
