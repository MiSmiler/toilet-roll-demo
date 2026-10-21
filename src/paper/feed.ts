import type { DragParams } from '../params'

export type Feed = {
  /** Smoothed progress, 0..1. */
  progress: number
  /** Unrolled length in world units. */
  length: number
  segments: number
  /** Paper speed in world units per second, used to drive the sway. */
  speed: number
  update(target: number, isDragging: boolean, dt: number): void
  reset(): void
}

type Phase = 'idle' | 'dragging' | 'coasting'

/**
 * Turns the raw swipe progress into the paper's progress: how tightly it
 * follows, and how it coasts after release.
 */
export function createFeed(params: DragParams): Feed {
  let progress = 0
  let velocity = 0
  let phase: Phase = 'idle'

  const feed: Feed = {
    progress: 0,
    length: 0,
    segments: 0,
    speed: 0,

    reset() {
      progress = 0
      velocity = 0
      phase = 'idle'
      sync()
    },

    update(target, isDragging, dt) {
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
        progress = clamp(progress + velocity * dt, 0, 1)
        velocity *= Math.exp(-4 * dt)
        if (Math.abs(velocity) < 0.05) {
          velocity = 0
          phase = 'idle'
        }
      }

      progress = clamp(progress, 0, 1)
      sync()
    },
  }

  function sync() {
    const maxLength = params.maxSegments * params.segmentLength
    feed.progress = progress
    feed.length = progress * maxLength
    feed.segments = Math.floor(progress * params.maxSegments + 1e-6)
    feed.speed = velocity * maxLength
  }

  return feed
}

function approach(current: number, target: number, stiffness: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-stiffness * dt))
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
