export function paintNavPlate(canvas: HTMLCanvasElement, width: number, height: number, dpr: number) {
  canvas.width = Math.ceil(width * dpr)
  canvas.height = Math.ceil(height * dpr)
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return
  const shade = context.createLinearGradient(0, 0, 0, canvas.height)
  shade.addColorStop(0, '#252832')
  shade.addColorStop(.17, '#191b22')
  shade.addColorStop(.56, '#101115')
  shade.addColorStop(1, '#1a1b22')
  context.fillStyle = shade
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = '#555964'
  context.fillRect(0, 2 * dpr, canvas.width, dpr)
  context.fillStyle = '#31343e'
  context.fillRect(0, canvas.height - 3 * dpr, canvas.width, dpr)
  const streak = context.createLinearGradient(0, 0, canvas.width, canvas.height)
  streak.addColorStop(0, 'transparent')
  streak.addColorStop(.48, '#b4c0dd28')
  streak.addColorStop(.63, 'transparent')
  context.fillStyle = streak
  context.fillRect(0, 0, canvas.width, canvas.height)
  return context.getImageData(0, 0, canvas.width, canvas.height)
}

export function refractNavPlate(canvas: HTMLCanvasElement, source: ImageData, rect: DOMRect, plate: DOMRect, dpr: number) {
  const width = Math.max(1, Math.round(rect.width * dpr))
  const height = Math.max(1, Math.round(rect.height * dpr))
  if (canvas.width !== width) canvas.width = width
  if (canvas.height !== height) canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const output = ctx.createImageData(width, height)
  const radius = Math.min(width, height) / 2
  const offsetX = (rect.left - plate.left) * dpr
  const offsetY = (rect.top - plate.top) * dpr
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - Math.min(width - radius, Math.max(radius, x))
      const dy = y - height / 2
      const distance = Math.hypot(dx, dy)
      if (distance >= radius || distance === 0) continue
      const rim = Math.max(0, 1 - (radius - distance) / (9 * dpr))
      const shift = 11 * dpr * rim ** 1.45
      const sx = Math.max(0, Math.min(source.width - 1, Math.round(offsetX + x - (dx / distance) * shift)))
      const sy = Math.max(0, Math.min(source.height - 1, Math.round(offsetY + y - (dy / distance) * shift)))
      const from = (sy * source.width + sx) * 4
      const to = (y * width + x) * 4
      const highlight = rim ** 2 * (dy < 0 ? 72 : 29)
      output.data[to] = source.data[from] * .94 + highlight + 2
      output.data[to + 1] = source.data[from + 1] * .94 + highlight + 3
      output.data[to + 2] = source.data[from + 2] * .96 + highlight + 5
      output.data[to + 3] = 255
    }
  }
  ctx.putImageData(output, 0, 0)
}
