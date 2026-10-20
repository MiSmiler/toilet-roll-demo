import type { DragParams } from '../params'
import type { Pull } from '../input/drag'

export type Feed = {
  /** Unrolled length in world units. */
  length: number
  segments: number
  /** World units per second, used to drive the sway. */
  velocity: number
  update(pull: Pull, dt: number): void
  reset(): void
}

type Phase = 'idle' | 'dragging' | 'coasting'

/**
 * The whole feel of the pull lives here: how far the pointer drags maps to how
 * much paper comes out, and what happens the moment the finger lifts.
 */
export function createFeed(params: DragParams): Feed {
  let length = 0
  let velocity = 0
  let phase: Phase = 'idle'

  const feed: Feed = {
    length: 0,
    segments: 0,
    velocity: 0,

    reset() {
      length = 0
      velocity = 0
      phase = 'idle'
      sync()
    },

    update(pull, dt) {
      const previousLength = length
      const maxLength = params.maxSegments * params.segmentLength

      if (pull.isDragging) {
        phase = 'dragging'
        const pulled = pull.pixels / params.pixelsPerUnit
        const target = clamp(pulled, 0, maxLength)
        const caughtUp = approach(length, target, params.followStiffness, dt)
        length = params.allowRewind ? caughtUp : Math.max(length, caughtUp)
        velocity = dt > 0 ? (length - previousLength) / dt : 0
      } else if (phase === 'dragging') {
        phase = params.momentum > 0 ? 'coasting' : 'idle'
        velocity *= params.momentum
      } else if (phase === 'coasting') {
        length = clamp(length + velocity * dt, 0, maxLength)
        velocity *= Math.exp(-4 * dt)
        if (Math.abs(velocity) < 0.05) {
          velocity = 0
          phase = 'idle'
        }
      }

      if (phase === 'idle' && params.snapOnRelease) {
        const nearestSegment = Math.round(length / params.segmentLength)
        const snapped = nearestSegment * params.segmentLength
        length = approach(length, clamp(snapped, 0, maxLength), 9, dt)
      }

      // Lowering the segment count in the lab must pull the paper back in.
      length = clamp(length, 0, maxLength)

      sync()
    },
  }

  function sync() {
    feed.length = length
    feed.velocity = velocity
    feed.segments = Math.min(params.maxSegments, Math.floor(length / params.segmentLength))
  }

  return feed
}

function approach(current: number, target: number, stiffness: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-stiffness * dt))
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
