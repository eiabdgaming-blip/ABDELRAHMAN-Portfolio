export function wrapReelIndex(index: number, count: number) {
  return count ? ((index % count) + count) % count : 0
}

export function visibleReelIndexes(active: number, count: number) {
  const next = wrapReelIndex(active + 1, count)
  if (count === 0) return []
  if (count === 1) return [active]
  if (count === 2) return [active, next]
  return [wrapReelIndex(active - 1, count), active, next]
}
