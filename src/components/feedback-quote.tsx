'use client'

import { useEffect, useId, useRef, useState } from 'react'

export function FeedbackQuote({ text }: { text: string }) {
  const id = useId()
  const quote = useRef<HTMLParagraphElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [overflow, setOverflow] = useState(false)

  useEffect(() => {
    const node = quote.current
    if (!node) return
    function check() {
      if (!node) return
      const lineHeight = parseFloat(getComputedStyle(node).lineHeight)
      setOverflow(node.scrollHeight > lineHeight * 5 + 1)
    }
    check()
    const observer = new ResizeObserver(check)
    observer.observe(node)
    const fonts = document.fonts
    fonts?.addEventListener('loadingdone', check)
    return () => { observer.disconnect(); fonts?.removeEventListener('loadingdone', check) }
  }, [text])

  return <div>
    <blockquote className="feedback-quote">
      <p dir="auto" id={id} ref={quote} data-collapsed={!expanded}>{text}</p>
    </blockquote>
    {(overflow || expanded) && <button type="button" className="feedback-quote-toggle" aria-expanded={expanded}
      aria-controls={id} onClick={() => setExpanded(!expanded)}>{expanded ? 'See less' : 'See more'}</button>}
  </div>
}
