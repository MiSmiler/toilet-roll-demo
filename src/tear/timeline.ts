import { gsap } from 'gsap'
import { params } from '../params'

/** How long the light takes to cross the frame. */
const FLOOD_SECONDS = 0.75

/** How long the white of the crack outlasts the strike, in seconds. */
const STRIKE_SECONDS = 0.16

/**
 * How long the halo takes to climb. The burst whitens the frame by getting brighter
 * rather than by being mixed toward white, so this is the whole first half of the
 * shot: the colour is still the colour when the light has stopped being lookable.
 */
const BLOOM_SECONDS = 0.55

/**
 * When the white starts closing over the frame, and how long it takes. It comes in on
 * the back of the halo, once that has already made the light too strong to watch, so
 * the fade is what finishes a frame that is nearly gone instead of what does the
 * whitening.
 */
const VEIL_START = 0.25
const VEIL_SECONDS = 0.45

/**
 * The frame at one age: everything the tear drives, as progress 0..1. How far and
 * how bright stays with the effect that draws it; when, how fast and on what
 * curve is decided here.
 */
export type TearBeat = {
  /** Seconds since the paper gave way. */
  age: number
  /** How far the flood's front has come, and how much of the frame it has washed. */
  flood: number
  /** The white of the crack: 1 on the strike frame, spent by the strike's end. */
  strike: number
  /** How far the halo has climbed: the burst getting too bright to look at. */
  bloom: number
  /** How far the white that ends the shot has closed over the frame. */
  veil: number
  /** The torn piece's drop and swing. */
  fall: number
  /** The camera's jolt: 1 when the paper gives way, 0 when it has settled. */
  shake: number
}

export type TearTimeline = {
  /**
   * The choreography at the current age, rewritten in place on every update.
   * Read it within the frame that produced it.
   */
  beat: TearBeat
  /** How long the act runs, in seconds: the end of whichever segment ends last. */
  readonly duration: number
  /**
   * Moves the tear on by one frame, or rewinds it to nothing while the paper is
   * whole again. Every frame is a function of the age alone, so the same age
   * always draws the same frame — which is what lets a script seek it.
   */
  update(torn: boolean, dt: number): void
  /**
   * Pins the tear at `seconds` so a torn frame can be seen or photographed, or lets
   * it run again with null. What a screenshot script and the lab's strip both steer.
   */
  holdAt(seconds: number | null): void
}

/**
 * The tear, as one timeline. It is built once and never plays itself: the render
 * loop hands it the frame's `dt`, and a script can seek it instead.
 *
 * Everything below this file's output is a pure read of `beat`, so a segment's
 * timing can be changed by editing one line here rather than by hunting the
 * ages each effect used to count for itself.
 */
export function createTearTimeline(): TearTimeline {
  // GSAP writes into these fields and nothing else does. One object rather than a
  // fresh one per frame, because GSAP drives properties, not immutable states.
  const beat: TearBeat = {
    age: 0,
    flood: 0,
    strike: 1,
    bloom: 0,
    veil: 0,
    fall: 0,
    shake: 1,
  }

  let pinned: number | null = null

  // `paused` with the tweens placing themselves by offset: the timeline is a
  // schedule, not a player. Shared position on 0 is what makes the flood, the
  // strike and the break one instant.
  const timeline = gsap.timeline({ paused: true })
  timeline.to(beat, { flood: 1, duration: FLOOD_SECONDS, ease: 'power1.out' }, 0)
  timeline.to(beat, { strike: 0, duration: STRIKE_SECONDS, ease: 'none' }, 0)
  timeline.to(beat, { bloom: 1, duration: BLOOM_SECONDS, ease: 'power1.out' }, 0)
  timeline.to(beat, { veil: 1, duration: VEIL_SECONDS, ease: 'power1.out' }, VEIL_START)
  // The piece and the jolt share a length, and that shared end is what makes the
  // drop read as the frame being knocked by the break rather than as two effects.
  timeline.to(beat, { fall: 1, duration: params.impactSeconds, ease: 'power2.out' }, 0)
  timeline.to(beat, { shake: 0, duration: params.impactSeconds, ease: 'power1.out' }, 0)

  /** The act's whole length, so a strip can offer its full range without repeating it. */
  const duration = timeline.duration()

  return {
    beat,
    duration,

    holdAt(seconds) {
      pinned = seconds
      // Applied as it is asked for, not on the next frame: a strip dragging its head
      // has to land the frames it passes through.
      if (seconds === null) return
      beat.age = seconds
      timeline.time(seconds)
    },

    update(torn, dt) {
      if (!torn) {
        beat.age = 0
        timeline.time(0)
        // The jolt belongs to the tear, not to the frame it starts at: parked at zero
        // with the paper whole, the shake tween is still at its first value, which
        // would hold the camera knocked off its framing for the whole drag.
        beat.shake = 0
        return
      }

      beat.age = pinned ?? beat.age + dt
      timeline.time(beat.age)
    },
  }
}
