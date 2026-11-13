'use client'

export default function WorkError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="work-page container">
      <h1 className="metallic-heading">WORK</h1>
      <p role="alert">Work could not be loaded.</p>
      <button className="glass" onClick={reset}>Try again</button>
    </main>
  )
}
