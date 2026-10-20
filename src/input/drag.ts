export type Pull = {
  pixels: number
  isDragging: boolean
  reset(): void
}

/**
 * Turns pointer movement into a single scalar: how far the user has pulled.
 * Purely about input — it knows nothing about paper.
 */
export function trackPull(surface: HTMLElement, axis: { x: number; y: number }): Pull {
  let lastPointer: { x: number; y: number } | null = null

  const pull: Pull = {
    pixels: 0,
    isDragging: false,
    reset() {
      lastPointer = null
      pull.pixels = 0
      pull.isDragging = false
    },
  }

  surface.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return
    lastPointer = { x: event.clientX, y: event.clientY }
    pull.isDragging = true
    surface.setPointerCapture(event.pointerId)
    document.body.classList.add('is-pulling')
  })

  surface.addEventListener('pointermove', (event) => {
    if (!lastPointer) return
    const dx = event.clientX - lastPointer.x
    const dy = event.clientY - lastPointer.y
    lastPointer = { x: event.clientX, y: event.clientY }
    pull.pixels += projectOnPullAxis(dx, dy, axis)
  })

  const endPull = () => {
    lastPointer = null
    pull.isDragging = false
    document.body.classList.remove('is-pulling')
  }
  surface.addEventListener('pointerup', endPull)
  surface.addEventListener('pointercancel', endPull)

  return pull
}

function projectOnPullAxis(dx: number, dy: number, axis: { x: number; y: number }): number {
  const axisLength = Math.hypot(axis.x, axis.y)
  if (axisLength === 0) return dy
  return (dx * axis.x + dy * axis.y) / axisLength
}
