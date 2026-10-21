export type DragParams = {
  /** How many screen heights of downward drag count as a full pull. */
  dragScreenHeights: number
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
}

export const params: DragParams = {
  dragScreenHeights: 1,
  followStiffness: 45,
  momentum: 0.25,
  allowRewind: true,
  snapOnRelease: true,
  segmentLength: 0.8,
  maxSegments: 10,
  sway: 0.022,
}

/** Perforations wrapped around the roll. */
const SEGMENTS_AROUND_ROLL = 4

/**
 * Fixed geometry of the prop. Sized so one segment reads as 5:4.
 *
 * The circumference is a whole number of segments, which is what keeps the
 * roll's perforations landing on the sheet's at every snapped length — the
 * roll always turns by exactly one perforation per segment fed.
 */
export const PAPER = {
  width: 1.0,
  rollRadius: (SEGMENTS_AROUND_ROLL * params.segmentLength) / (2 * Math.PI),
  coreRadius: 0.18,
  rollCenterY: 1.9,
}
