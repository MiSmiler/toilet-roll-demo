import type { Rarity } from './scene/rarity'

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
  /** How long the tear and the camera jolt take to settle; they end together. */
  impactSeconds: number
  /** Vertical camera jolt at the tear, in world units. */
  cameraShake: number
  /** Camera roll at the tear, in radians; it rocks both ways. */
  cameraShakeRoll: number
  /** Camera height at rest, in world units. */
  cameraStartY: number
  /** Camera distance, held constant through the pull; the framing changes by aim, not zoom. */
  cameraDistance: number
  /** What the camera looks at when at rest; the roll center. */
  cameraStartLookY: number
  /** Camera height when the paper is fully pulled out. */
  cameraEndY: number
  /** What the camera looks at when fully pulled: the tear line, so the crack sits centered. */
  cameraEndLookY: number
  /**
   * Which rarity the cut shows. A preview choice only — there is no drop table
   * deciding it yet.
   */
  rarity: Rarity
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
  impactSeconds: 0.2,
  cameraShake: 0.6,
  cameraShakeRoll: 0.09,
  cameraStartY: 1.5,
  cameraDistance: 3.8,
  cameraStartLookY: 1.9,
  cameraEndY: 0.6,
  cameraEndLookY: 1.6,
  rarity: 'rare',
}

/**
 * Which effects are drawn. Each one can be taken away without leaving a hole in
 * the scene, so the lab can switch it off and judge what it contributed by the
 * difference — that is the only honest way to argue an effect earns its cost.
 */
export type Effects = {
  /** The bloom pass, which turns light pushed past white into a halo. */
  bloom: boolean
  /** The charge's shadow, multiplied over the prop as the seam opens. */
  shadow: boolean
  /** The flood of light that leaves the crack when the paper gives way. */
  burst: boolean
  /** The prism in the light: the one rarity that splits its halo into colour. */
  prism: boolean
  /** Motes and sparks thrown out of the seam. */
  particles: boolean
  /** The paper's tremble under strain, and the roll's jitter as it feeds. */
  paperTremble: boolean
  /** The camera's jolt when the paper lets go. */
  cameraShake: boolean
  /**
   * The white the burst ends on: once the flood has crossed the frame, the whole
   * picture goes white and stays there until the paper is whole again.
   */
  whiteout: boolean
  /** The torn piece dropping and swinging free. */
  tearFall: boolean
  /** The strip's sideways swing while it moves. */
  paperSway: boolean
}

export const effects: Effects = {
  bloom: true,
  shadow: true,
  burst: true,
  prism: true,
  particles: true,
  paperTremble: true,
  cameraShake: true,
  whiteout: true,
  tearFall: true,
  paperSway: true,
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
