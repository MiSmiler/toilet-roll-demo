/** Fixed geometry of the prop. Sized so one segment reads as 5:4. */
export const PAPER = {
  width: 1.0,
  rollRadius: 0.5,
  coreRadius: 0.18,
  rollCenterY: 1.9,
}

/**
 * The swipe: starts inside the paper's column, ends on a fixed point near the
 * bottom of the screen. The fractions are of the viewport, not of pixels.
 */
export const GESTURE = {
  endX: 0.5,
  endY: 0.8,
  /** The start box must stay above the end point, or the swipe cannot reach it. */
  zoneBottom: 0.6,
  /** Sideways slack on each side, as a fraction of the paper's on-screen width. */
  zoneMargin: 0.5,
}

export type DragParams = {
  /** How fast the paper catches up to the pointer. Higher is tighter. */
  followStiffness: number
  /** Share of the release velocity kept as coasting. Zero stops dead. */
  momentum: number
  allowRewind: boolean
  snapOnRelease: boolean
  segmentLength: number
  maxSegments: number
  /** Sideways drift amplitude, scaled by how fast the paper is moving. */
  sway: number
  showStartZone: boolean
  showEndPoint: boolean
}

export const params: DragParams = {
  followStiffness: 45,
  momentum: 0.25,
  allowRewind: true,
  snapOnRelease: true,
  segmentLength: 0.8,
  maxSegments: 10,
  sway: 0.022,
  showStartZone: false,
  showEndPoint: true,
}
