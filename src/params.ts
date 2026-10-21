export type DragParams = {
  /** How many screen heights of downward drag count as a full pull. */
  dragScreenHeights: number
  /** How fast the paper catches up to the pointer. Higher is tighter. */
  followStiffness: number
  /** Share of the release velocity kept as coasting. Zero stops dead. */
  momentum: number
  allowRewind: boolean
  segmentLength: number
  maxSegments: number
  /**
   * How much of the roll unwinds at full pull. Below 1 the last stretch stays
   * on the roll, which is what "pulled all the way out" looks like.
   */
  maxProgress: number
  /** Sideways drift amplitude, scaled by how fast the paper is moving. */
  sway: number
  /** Screen heights of extra drag past the end that fill the strain meter. */
  strainTravel: number
  /** Peak tremble, in world units, at full strain. */
  shake: number
  /** How far the torn edge wanders across the paper, in world units. */
  tearJag: number
  /** How far the ten-segment piece drops after it tears free, in world units. */
  tearDrop: number
  /** How far the piece swings from its torn edge, in radians. */
  tearSwing: number
  /** How long the piece takes to snap free; it then holds its dropped pose. */
  tearSeconds: number
}

export const params: DragParams = {
  dragScreenHeights: 1,
  followStiffness: 45,
  momentum: 0.25,
  allowRewind: true,
  segmentLength: 0.8,
  maxSegments: 10,
  maxProgress: 0.95,
  sway: 0.022,
  strainTravel: 0.3,
  shake: 0.012,
  tearJag: 0.03,
  tearDrop: 0.6,
  tearSwing: 0.04,
  tearSeconds: 0.2,
}

/** Perforations wrapped around the roll. */
const SEGMENTS_AROUND_ROLL = 4

/**
 * Fixed geometry of the prop. Sized so one segment reads as 5:4.
 *
 * The circumference is a whole number of segments, which is what keeps the
 * roll's perforations landing on the sheet's — the roll always turns by exactly
 * one perforation per segment fed.
 */
export const PAPER = {
  width: 1.0,
  rollRadius: (SEGMENTS_AROUND_ROLL * params.segmentLength) / (2 * Math.PI),
  coreRadius: 0.18,
  rollCenterY: 1.9,
}
