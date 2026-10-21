import * as THREE from 'three'
import type { Feed } from '../paper/feed'
import type { PaperParts, ToiletRoll } from '../scene/toiletRoll'
import { effects, params, type Effects } from '../params'
import type { Rarity } from '../scene/rarity'

/** Everything a frame is built from, plus the surface the frame lands on. */
export type SceneState = {
  /** Smoothed pull progress, 0..1. */
  progress: number
  /** How hard the pull is straining past the end, 0..1. */
  strain: number
  /** True once the paper has torn. */
  torn: boolean
  /** Which rarity the cut shows, as the lab's radio buttons left it. */
  rarity: Rarity
  segments: number
  /** Unrolled length in world units. */
  length: number
  /** Segment size and total count: with `progress`, they pin down the geometry. */
  segmentLength: number
  maxSegments: number
  /** Layout size in CSS pixels, i.e. what the page believes the screen is. */
  viewport: { width: number; height: number }
  devicePixelRatio: number
  parts: PaperParts
  /** The effect switches as the lab left them. */
  effects: Effects
}

export type Rect = { x: number; y: number; width: number; height: number }

export type Probe = {
  read(): SceneState
  /** Puts the paper at an exact progress, with no smoothing and no coasting. */
  setProgress(progress: number): void
  /**
   * Pins the strain so the taut pull can be photographed before it tears; the
   * beam's colour and glow are read off it.
   */
  holdStrain(strain: number): void
  /**
   * Pins the scene clock so a strip of frames shares one animation phase, or
   * lets it run again with null. A script's knob only.
   */
  freezeTime(at: number | null): void
  show(parts: Partial<PaperParts>): void
  /**
   * Pins how far into the tear's flood the frame is, or lets it run again with
   * null. Like freezeTime, a script's knob only.
   */
  holdBurst(seconds: number | null): void
  /** Where the paper lands on the page, in CSS pixels — the unit a screenshot clip takes. */
  paperRect(): Rect
}

type Dependencies = {
  feed: Feed
  paper: ToiletRoll
  camera: THREE.Camera
  canvas: HTMLCanvasElement
  freezeTime: (at: number | null) => void
}

declare global {
  interface Window {
    debug: Probe
  }
}

/**
 * The handle a script drives the scene through. The lab panel renders the same
 * read(), so what a human reads off the screen and what a script sets can never
 * drift apart.
 *
 * A settled scene keeps its sway at zero, so the same progress redraws the very
 * same pixels — which is what makes two screenshots comparable.
 */
export function createProbe({ feed, paper, camera, canvas, freezeTime }: Dependencies): Probe {
  return {
    read: () => ({
      progress: feed.progress,
      strain: feed.strain,
      torn: feed.torn,
      rarity: params.rarity,
      segments: feed.segments,
      length: feed.length,
      segmentLength: params.segmentLength,
      maxSegments: params.maxSegments,
      viewport: { width: canvas.clientWidth, height: canvas.clientHeight },
      devicePixelRatio: window.devicePixelRatio,
      parts: paper.parts(),
      effects: { ...effects },
    }),

    setProgress: (progress) => feed.settle(progress),

    holdStrain: (strain) => feed.holdStrain(strain),

    freezeTime,

    show: (parts) => paper.show(parts),

    holdBurst: (seconds) => paper.holdBurst(seconds),

    paperRect: () => projectBox(paper.bounds(), camera, canvas),
  }
}

/**
 * The screen-space bounds of a world box: project all eight corners and keep the
 * extremes. A box is enough because the prop never leaves its own silhouette.
 */
function projectBox(box: THREE.Box3, camera: THREE.Camera, canvas: HTMLCanvasElement): Rect {
  const point = new THREE.Vector3()
  const across = { min: Infinity, max: -Infinity }
  const down = { min: Infinity, max: -Infinity }

  for (const x of [box.min.x, box.max.x]) {
    for (const y of [box.min.y, box.max.y]) {
      for (const z of [box.min.z, box.max.z]) {
        point.set(x, y, z).project(camera)
        const screenX = ((point.x + 1) / 2) * canvas.clientWidth
        const screenY = ((1 - point.y) / 2) * canvas.clientHeight
        across.min = Math.min(across.min, screenX)
        across.max = Math.max(across.max, screenX)
        down.min = Math.min(down.min, screenY)
        down.max = Math.max(down.max, screenY)
      }
    }
  }

  return { x: across.min, y: down.min, width: across.max - across.min, height: down.max - down.min }
}
