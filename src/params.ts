/** Fixed geometry of the prop. Tuning that never changes at runtime lives here. */
export const PAPER = {
  width: 1.4,
  rollRadius: 0.55,
  coreRadius: 0.2,
  rollCenterY: 1.05,
}

export type DragParams = {
  /** Screen pixels pulled to feed one world unit of paper. Lower is twitchier. */
  pixelsPerUnit: number
  /** How fast the strip catches up to the pointer. Higher is tighter. */
  followStiffness: number
  /** Share of the release velocity kept as coasting. Zero stops dead. */
  momentum: number
  allowRewind: boolean
  snapOnRelease: boolean
  segmentLength: number
  maxSegments: number
  /** Sideways drift amplitude, scaled by how fast the paper is moving. */
  sway: number
  /** Screen direction of a positive pull. */
  pullAxis: { x: number; y: number }
}

export const params: DragParams = {
  pixelsPerUnit: 220,
  followStiffness: 45,
  momentum: 0.25,
  allowRewind: true,
  snapOnRelease: false,
  segmentLength: 0.3,
  maxSegments: 10,
  sway: 0.022,
  pullAxis: { x: 0.25, y: 1 },
}
