import type { GestureArea } from './area'

export type Swipe = {
  /** Raw gesture progress: how far along the path from the press to the end point. */
  target: number
  isDragging: boolean
  reset(): void
}

/**
 * Allowed to start anywhere inside the paper's column and to end on a fixed
 * screen point. The distance between the two only changes how far a pixel
 * travels, never the fact that reaching the end point means ten segments.
 */
export function trackSwipe(surface: HTMLElement, area: () => GestureArea): Swipe {
  let lastPoint: { x: number; y: number } | null = null
  let axis = { x: 0, y: 1 }
  let pathLength = 1

  const swipe: Swipe = {
    target: 0,
    isDragging: false,
    reset() {
      lastPoint = null
      swipe.target = 0
      swipe.isDragging = false
    },
  }

  surface.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return

    const gesture = area()
    if (!contains(gesture.start, event.clientX, event.clientY)) return

    const toEndX = gesture.end.x - event.clientX
    const toEndY = gesture.end.y - event.clientY
    const distance = Math.hypot(toEndX, toEndY)
    if (distance < 1) return

    axis = { x: toEndX / distance, y: toEndY / distance }
    pathLength = distance
    lastPoint = { x: event.clientX, y: event.clientY }
    swipe.isDragging = true
    surface.setPointerCapture(event.pointerId)
    document.body.classList.add('is-pulling')
  })

  surface.addEventListener('pointermove', (event) => {
    if (!lastPoint) return

    const dx = event.clientX - lastPoint.x
    const dy = event.clientY - lastPoint.y
    lastPoint = { x: event.clientX, y: event.clientY }

    // Movement across the path counts for nothing; only progress toward the end does.
    const towardsEnd = dx * axis.x + dy * axis.y
    swipe.target = clamp(swipe.target + towardsEnd / pathLength, 0, 1)
  })

  const endSwipe = () => {
    lastPoint = null
    swipe.isDragging = false
    document.body.classList.remove('is-pulling')
  }
  surface.addEventListener('pointerup', endSwipe)
  surface.addEventListener('pointercancel', endSwipe)

  return swipe
}

function contains(rect: { left: number; top: number; right: number; bottom: number }, x: number, y: number) {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
