import type { GestureArea } from '../input/area'
import { params } from '../params'

export type Overlay = {
  update(area: GestureArea): void
}

/**
 * Screen-space guides for the swipe. The end point is always visible so the
 * gesture has somewhere to aim; the start box is a debug aid.
 */
export function createOverlay(host: HTMLElement): Overlay {
  const startBox = document.createElement('div')
  startBox.className = 'guide guide--start'

  const endPoint = document.createElement('div')
  endPoint.className = 'guide guide--end'

  host.append(startBox, endPoint)

  return {
    update(area) {
      startBox.hidden = !params.showStartZone
      startBox.style.left = `${area.start.left}px`
      startBox.style.top = `${area.start.top}px`
      startBox.style.width = `${area.start.right - area.start.left}px`
      startBox.style.height = `${area.start.bottom - area.start.top}px`

      endPoint.style.left = `${area.end.x}px`
      endPoint.style.top = `${area.end.y}px`
    },
  }
}
