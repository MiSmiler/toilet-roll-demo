import type { DragParams } from '../params'

export type Feed = {
  /** Smoothed progress, 0..1. */
  progress: number
  /** Unrolled length in world units. */
  length: number
  segments: number
  /** Paper speed in world units per second, used to drive the sway. */
  speed: number
  /**
   * How hard the player is pulling past the end, 0..1. It only builds while
   * they keep dragging after the paper has stopped moving; letting go releases
   * it. The scene turns it into tremble.
   */
  strain: number
  /** True once a full-strain pull has ripped the paper; the drag is then ignored. */
  torn: boolean
  update(target: number, isDragging: boolean, dt: number): void
  /** Puts the paper at an exact progress, with no smoothing and no coasting. */
  settle(progress: number): void
  reset(): void
}

type Phase = 'idle' | 'dragging' | 'coasting'

/** How fast the strain follows the pointer. Fast enough to feel direct. */
const STRAIN_STIFFNESS = 24

/**
 * A taut paper already trembles at half strength; the rest of the travel takes
 * it to the tear. Without this floor the first, barely-past-the-end pull is too
 * calm to read as effort.
 */
export const STRAIN_FLOOR = 0.5

/** How close to full strain counts as the paper giving way. */
const TEAR_AT = 0.99

/**
 * Turns the raw swipe progress into the paper's progress: how tightly it
 * follows, and how it coasts after release.
 */
export function createFeed(params: DragParams): Feed {
  let progress = 0
  let velocity = 0
  let strain = 0
  let torn = false
  let phase: Phase = 'idle'

  const feed: Feed = {
    progress: 0,
    length: 0,
    segments: 0,
    speed: 0,
    strain: 0,
    torn: false,

    settle,

    reset() {
      settle(0)
    },

    update(target, isDragging, dt) {
      if (torn) return

      const previous = progress

      if (isDragging) {
        phase = 'dragging'
        const caughtUp = approach(progress, target, params.followStiffness, dt)
        progress = params.allowRewind ? caughtUp : Math.max(progress, caughtUp)
        velocity = dt > 0 ? (progress - previous) / dt : 0
      } else if (phase === 'dragging') {
        phase = params.momentum > 0 ? 'coasting' : 'idle'
        velocity *= params.momentum
      } else if (phase === 'coasting') {
        progress = clamp(progress + velocity * dt, 0, params.maxProgress)
        velocity *= Math.exp(-4 * dt)
        if (Math.abs(velocity) < 0.05) {
          velocity = 0
          phase = 'idle'
        }
      }

      progress = clamp(progress, 0, params.maxProgress)
      updateStrain(target, isDragging, dt)
      sync()
    },
  }

  function settle(next: number) {
    progress = clamp(next, 0, params.maxProgress)
    velocity = 0
    strain = 0
    torn = false
    phase = 'idle'
    sync()
  }

  function sync() {
    const maxLength = params.maxSegments * params.segmentLength
    feed.progress = progress
    feed.length = progress * maxLength
    feed.segments = Math.floor(progress * params.maxSegments + 1e-6)
    feed.speed = velocity * maxLength
    feed.strain = strain
    feed.torn = torn
  }

  /**
   * Strain is the drag the paper cannot follow. It starts at half strength the
   * moment the paper gives all it has, then the remaining travel takes it to a
   * tear. Holding the pointer there keeps the strain, so a taut pull can tremble
   * without the player wearing their finger out; letting go is what relaxes it.
   */
  function updateStrain(target: number, isDragging: boolean, dt: number) {
    const dragPastTheEnd = target - params.maxProgress
    const paperGaveAll = progress >= params.maxProgress - 1e-6
    const stillPulling = isDragging && paperGaveAll && dragPastTheEnd > 0
    const overshoot = clamp01(dragPastTheEnd / params.strainTravel)
    const strainTarget = stillPulling ? STRAIN_FLOOR + (1 - STRAIN_FLOOR) * overshoot : 0
    strain = approach(strain, strainTarget, STRAIN_STIFFNESS, dt)

    if (stillPulling && tearLineIsClear() && strain >= TEAR_AT) tear()
  }

  /** The tear can only happen once the ten-segment boundary is off the roll. */
  function tearLineIsClear(): boolean {
    const countedLength = params.maxSegments * params.segmentLength
    const renderLength = progress * countedLength + params.segmentLength
    return renderLength > countedLength
  }

  function tear() {
    torn = true
    strain = 0
    velocity = 0
    phase = 'idle'
  }

  return feed
}

function approach(current: number, target: number, stiffness: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-stiffness * dt))
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function clamp01(value: number): number {
  return clamp(value, 0, 1)
}
