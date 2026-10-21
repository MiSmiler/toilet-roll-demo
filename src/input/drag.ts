export type Pull = {
  /**
   * Progress the paper should follow. Above 1 the paper has stopped, but the
   * pull has not, and the feed turns the excess into strain.
   */
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
 * should follow. A gesture starts from wherever the paper actually sits. Travel
 * past the start is dropped, because there is no paper to give; travel past the
 * end is kept, because it is exactly the effort that strains the paper.
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
    pull.target = Math.max(0, pull.target + travel / source.pixelsPerFullPull())
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
