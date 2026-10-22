import { gsap } from 'gsap'
import { params } from '../params'

/** How long the light takes to cross the frame. */
const FLOOD_SECONDS = 0.75

/** How long the white of the crack outlasts the strike, in seconds. */
const STRIKE_SECONDS = 0.16

/**
 * When the screen starts taking the rarity's colour, and how long it takes to be
 * all of it: it is complete at the moment the flood has taken the whole frame, so
 * the colour lands on the light and the paper is gone from it. A colour that
 * arrives later leaves the paper showing through as a ghost of itself.
 */
const COVER_START = 0.3
const COVER_SECONDS = 0.45

/**
 * The white that follows, in seconds after the tear. It starts the instant the
 * colour is complete — the frame bleaches out of that colour rather than after a
 * pause — and runs on the same shape as the flood.
 */
const BLEACH_START = COVER_START + COVER_SECONDS
const BLEACH_SECONDS = 0.5

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
  /** How much of the screen the rarity's colour covers. */
  cover: number
  /** How far that colour has bleached to white. */
  bleach: number
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
  /**
   * Moves the tear on by one frame, or rewinds it to nothing while the paper is
   * whole again. Every frame is a function of the age alone, so the same age
   * always draws the same frame — which is what lets a script seek it.
   */
  update(torn: boolean, dt: number): void
  /**
   * Pins the tear at `seconds` so a torn frame can be photographed, or lets it
   * run again with null. A script's knob only.
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
    cover: 0,
    bleach: 0,
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
  timeline.to(beat, { cover: 1, duration: COVER_SECONDS, ease: 'power1.out' }, COVER_START)
  timeline.to(beat, { bleach: 1, duration: BLEACH_SECONDS, ease: 'power1.out' }, BLEACH_START)
  // The piece and the jolt share a length, and that shared end is what makes the
  // drop read as the frame being knocked by the break rather than as two effects.
  timeline.to(beat, { fall: 1, duration: params.impactSeconds, ease: 'power2.out' }, 0)
  timeline.to(beat, { shake: 0, duration: params.impactSeconds, ease: 'power1.out' }, 0)

  return {
    beat,

    holdAt(seconds) {
      pinned = seconds
    },

    update(torn, dt) {
      if (!torn) {
        beat.age = 0
        timeline.time(0)
        return
      }

      beat.age = pinned ?? beat.age + dt
      timeline.time(beat.age)
    },
  }
}
