import * as THREE from 'three'
import { GESTURE, PAPER } from '../params'

export type Rect = { left: number; top: number; right: number; bottom: number }
export type Point = { x: number; y: number }

export type GestureArea = {
  /** Where a swipe is allowed to begin. */
  start: Rect
  /** Where a swipe must end to reach ten segments. */
  end: Point
}

/**
 * Both the start box and the end point live in screen space, measured from the
 * paper's projected position so the box hugs the prop at any window size.
 */
export function measureGestureArea(
  camera: THREE.PerspectiveCamera,
  width: number,
  height: number,
): GestureArea {
  const rollTop = toScreen(camera, 0, PAPER.rollCenterY + PAPER.rollRadius, width, height)
  const paperLeft = toScreen(camera, -PAPER.width / 2, PAPER.rollCenterY, width, height)
  const paperRight = toScreen(camera, PAPER.width / 2, PAPER.rollCenterY, width, height)

  const paperHalf = Math.abs(paperRight.x - paperLeft.x) / 2
  const centerX = (paperLeft.x + paperRight.x) / 2
  const margin = paperHalf * GESTURE.zoneMargin

  const end = { x: width * GESTURE.endX, y: height * GESTURE.endY }
  const bottomLimit = Math.min(height * GESTURE.zoneBottom, end.y - margin)

  return {
    start: {
      left: centerX - paperHalf - margin,
      right: centerX + paperHalf + margin,
      top: rollTop.y - margin,
      bottom: bottomLimit,
    },
    end,
  }
}

function toScreen(
  camera: THREE.PerspectiveCamera,
  worldX: number,
  worldY: number,
  width: number,
  height: number,
): Point {
  const projected = new THREE.Vector3(worldX, worldY, 0).project(camera)
  return {
    x: (projected.x * 0.5 + 0.5) * width,
    y: (1 - (projected.y * 0.5 + 0.5)) * height,
  }
}
