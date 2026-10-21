export type Pull = {
  /** Accumulated downward drag in screen pixels. */
  pixels: number
  isDragging: boolean
  reset(): void
}

/**
 * Turns pointer movement anywhere on the surface into one scalar: how far the
 * user has dragged downwards. Knows nothing about paper.
 */
export function trackPull(surface: HTMLElement): Pull {
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
    pull.pixels += event.clientY - lastPointer.y
    lastPointer = { x: event.clientX, y: event.clientY }
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
