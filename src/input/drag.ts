export type Pull = {
  /** Progress the paper should follow, 0..1. */
  target: number
  isDragging: boolean
  reset(): void
}

export type PullSource = {
  /** Where the paper sits right now. A new gesture continues from here. */
  progress(): number
  /** Screen pixels of downward drag that make a full pull. */
  pixelsPerFullPull(): number
}

/**
 * Turns pointer movement anywhere on the surface into the progress the paper
 * should follow. A gesture starts from wherever the paper actually sits, and
 * travel past either end is dropped as it happens — otherwise the pointer runs
 * up a debt that the paper has to pay off before it moves again.
 */
export function trackPull(surface: HTMLElement, source: PullSource): Pull {
  let lastY: number | null = null

  const pull: Pull = {
    target: 0,
    isDragging: false,
    reset() {
      lastY = null
      pull.target = 0
      pull.isDragging = false
    },
  }

  surface.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return
    lastY = event.clientY
    pull.target = source.progress()
    pull.isDragging = true
    surface.setPointerCapture(event.pointerId)
    document.body.classList.add('is-pulling')
  })

  surface.addEventListener('pointermove', (event) => {
    if (lastY === null) return
    const travel = event.clientY - lastY
    lastY = event.clientY
    pull.target = clamp(pull.target + travel / source.pixelsPerFullPull(), 0, 1)
  })

  const endPull = () => {
    lastY = null
    pull.isDragging = false
    document.body.classList.remove('is-pulling')
  }
  surface.addEventListener('pointerup', endPull)
  surface.addEventListener('pointercancel', endPull)

  return pull
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
