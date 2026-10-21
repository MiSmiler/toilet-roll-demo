import * as THREE from 'three'
import { effects, PAPER, params } from '../params'
import { createRollTexture, createSheetTexture } from './paperTextures'
import { createTearLine } from './tearLine'
import type { Rarity } from './rarity'

/** Rows down the ten-segment piece. The short tail needs far fewer. */
const BODY_ROWS = 72
const TAIL_ROWS = 1

/** Columns across the paper: enough for the torn edge to have teeth. */
const COLUMNS = 16

/** How quickly the jag grows as the tear line leaves the roll. */
const JAG_RAMP = 0.1

/** Lifts the sheet a hair off the roll so the tangent line never z-fights. */
const SHEET_OFFSET_Z = PAPER.rollRadius + 0.006

/**
 * The tear across the paper, sampled left to right. Fixed rather than random so
 * every run and every screenshot tears the same way.
 */
const JAG_PROFILE = createJagProfile(16)

export type PaperState = {
  /** Unrolled length in world units. */
  length: number
  /** Sideways drift amplitude in world units. */
  sway: number
  /** How hard the pull is straining past the end, 0..1. */
  strain: number
  /** True once the paper has torn; the scene plays the separation from here. */
  torn: boolean
  /** Which rarity the cut shows, set before the pull and read by the tear line. */
  rarity: Rarity
  /** Scene time, for the world's own animation. */
  time: number
  /** Real seconds since the last frame, for transitions that ignore the clock. */
  dt: number
}

/** Which parts of the prop are drawn. A debug run switches them one at a time. */
export type PaperParts = {
  roll: boolean
  sheet: boolean
  tearLine: boolean
}

export type ToiletRoll = {
  object: THREE.Group
  setPaper(state: PaperState): void
  show(parts: Partial<PaperParts>): void
  parts(): PaperParts
  /** World box the prop can occupy now; generous on purpose, see the call site. */
  bounds(): THREE.Box3
}

/**
 * The prop: a roll seen end-on plus the segment hanging from its front tangent
 * point. Both are driven by one number — the unrolled length.
 *
 * The sheet is two ribbons rather than one: the ten-segment piece and the short
 * tail that stays on the roll. Their torn edges are the same jagged profile, so
 * while the paper is whole they meet without a seam.
 */
export function createToiletRoll(): ToiletRoll {
  const object = new THREE.Group()
  object.position.y = PAPER.rollCenterY

  const spinner = new THREE.Group()
  object.add(spinner)

  const rollTexture = createRollTexture()
  const rollMaterial = new THREE.MeshStandardMaterial({
    map: rollTexture,
    roughness: 0.95,
    metalness: 0,
  })
  const rollBody = new THREE.Mesh(
    new THREE.CylinderGeometry(PAPER.rollRadius, PAPER.rollRadius, PAPER.width, 72, 1, true),
    rollMaterial,
  )
  rollBody.rotation.z = Math.PI / 2
  spinner.add(rollBody)

  const coreMaterial = new THREE.MeshStandardMaterial({
    color: 0xc8a878,
    roughness: 0.95,
    side: THREE.DoubleSide,
  })
  const core = new THREE.Mesh(
    new THREE.CylinderGeometry(PAPER.coreRadius, PAPER.coreRadius, PAPER.width, 40, 1, true),
    coreMaterial,
  )
  core.rotation.z = Math.PI / 2
  spinner.add(core)

  const cutMaterial = new THREE.MeshStandardMaterial({
    color: 0xefe9da,
    roughness: 1,
    side: THREE.DoubleSide,
  })
  const cutRing = new THREE.RingGeometry(PAPER.coreRadius, PAPER.rollRadius, 72)
  for (const side of [-1, 1]) {
    const cap = new THREE.Mesh(cutRing, cutMaterial)
    cap.rotation.y = Math.PI / 2
    cap.position.x = (side * PAPER.width) / 2
    spinner.add(cap)
  }

  const sheetTexture = createSheetTexture()
  const sheetMaterial = new THREE.MeshStandardMaterial({
    map: sheetTexture,
    roughness: 0.96,
    metalness: 0,
    side: THREE.DoubleSide,
  })

  const bodyGeometry = createRibbonGeometry(BODY_ROWS)
  const body = new THREE.Mesh(bodyGeometry, sheetMaterial)
  // The ribbons are rewritten every frame, so stale bounding spheres would cull them.
  body.frustumCulled = false
  // The body pivots at its torn top edge, so it can swing away from the roll.
  const bodyGroup = new THREE.Group()
  bodyGroup.position.z = SHEET_OFFSET_Z
  bodyGroup.add(body)
  object.add(bodyGroup)

  const tailGeometry = createRibbonGeometry(TAIL_ROWS)
  const tail = new THREE.Mesh(tailGeometry, sheetMaterial)
  tail.frustumCulled = false
  object.add(tail)

  const tearLine = createTearLine()
  // Fixed in front of the sheet; only its x and y follow the paper.
  tearLine.object.position.z = SHEET_OFFSET_Z + 0.002
  object.add(tearLine.object)

  const bodyPositions = bodyGeometry.attributes.position.array as Float32Array
  const bodyUvs = bodyGeometry.attributes.uv.array as Float32Array
  const tailPositions = tailGeometry.attributes.position.array as Float32Array
  const tailUvs = tailGeometry.attributes.uv.array as Float32Array

  const enabled: PaperParts = { roll: true, sheet: true, tearLine: true }
  /** Length currently drawn, kept so bounds() can answer without arguments. */
  let drawnLength = params.segmentLength
  /** How much paper hangs above the ten counted segments, kept for show(). */
  let tailLength = 0
  /** Scene time when the tear started, null while the paper is whole. */
  let tornAt: number | null = null

  return {
    object,

    show(parts) {
      Object.assign(enabled, parts)
      spinner.visible = enabled.roll
      body.visible = enabled.sheet
      tail.visible = enabled.sheet && tailLength > 0
    },

    parts: () => ({ ...enabled }),

    bounds() {
      // Wide enough for the sheet's sway, tremble and swing, deep enough for the
      // dropped piece and the roll's curve behind the sheet.
      const margin = params.shake * 3
      const drop = tornAt === null ? 0 : params.tearDrop
      const swingReach = tornAt === null ? 0 : params.tearSwing * drawnLength
      const halfWidth = PAPER.width / 2 + params.sway + margin + swingReach
      return new THREE.Box3(
        new THREE.Vector3(-halfWidth, PAPER.rollCenterY - drawnLength - margin - drop, -PAPER.rollRadius),
        new THREE.Vector3(halfWidth, PAPER.rollCenterY + PAPER.rollRadius + margin, SHEET_OFFSET_Z + 0.01),
      )
    },

    setPaper({ length, sway, strain, torn, rarity, time, dt }) {
      // One segment always hangs below the last counted one, so the tear line
      // never sits on the paper's own edge.
      const renderLength = length + params.segmentLength
      drawnLength = renderLength

      // The tear line is one segment above the ten counted ones. Only once it
      // clears the roll is there a tail to tear against.
      const countedLength = params.maxSegments * params.segmentLength
      tailLength = Math.max(0, renderLength - countedLength)
      const bodyTopY = -tailLength
      const bodyLength = renderLength + bodyTopY

      // The strain already carries a half-strength floor, so the tremble is
      // visible the moment the paper goes taut and grows from there. Everything
      // the tremble drives reads this one value, so the lab can take the whole
      // tremble away by zeroing it.
      const effort = effects.paperTremble ? strain : 0

      // Roll and sheet share the group's tremble. The roll adds a twist and the
      // sheet's free end whips further, so the prop reads as strained rather
      // than as one rigid object being shaken.
      object.position.x = tremor(time, 41, 0) * params.shake * effort
      object.position.y = PAPER.rollCenterY + tremor(time, 57, 1.7) * params.shake * effort * 0.6
      object.rotation.z = tremor(time, 33, 3.1) * 0.0015 * effort

      spinner.rotation.x = length / PAPER.rollRadius + tremor(time, 67, 0.9) * 0.015 * effort

      if (torn) {
        tornAt ??= time
      } else {
        tornAt = null
      }
      const tearProgress = tornAt === null ? 0 : clamp01((time - tornAt) / params.impactSeconds)

      // The body pivots at the torn edge. Before the tear it sits exactly under
      // the tail; after, it snaps away and holds.
      const tearEase = easeOutSnap(tearProgress)
      const drop = effects.tearFall ? params.tearDrop : 0
      const swing = effects.tearFall ? params.tearSwing : 0
      bodyGroup.position.y = bodyTopY - drop * tearEase
      bodyGroup.rotation.z = swing * tearEase

      const jag = params.tearJag * clamp01(tailLength / JAG_RAMP)

      // At the tear the body keeps its last shaken shape and stops being
      // rewritten; from then on it is one rigid piece falling away.
      if (!torn) {
        writeBody(bodyPositions, bodyUvs, bodyTopY, bodyLength, renderLength, jag, sway, effort, time)
        bodyGeometry.attributes.position.needsUpdate = true
        bodyGeometry.attributes.uv.needsUpdate = true
      }

      writeTail(tailPositions, tailUvs, bodyTopY, renderLength, jag, sway, effort, time)
      tailGeometry.attributes.position.needsUpdate = true
      tailGeometry.attributes.uv.needsUpdate = true
      tail.visible = enabled.sheet && tailLength > 0

      tearLine.update({
        x: sheetOffsetAt(bodyTopY, renderLength, sway, effort, time),
        y: bodyTopY,
        active: tailLength > 0 && enabled.tearLine && !torn,
        time,
        dt,
        strain,
        rarity,
      })

      // The UVs are in segment units, so one texture tile always covers one
      // segment and the perforations continue across the torn seam.
      sheetTexture.repeat.set(1, 1)
      const segmentsAround = Math.max(1, Math.round((2 * Math.PI * PAPER.rollRadius) / params.segmentLength))
      rollTexture.repeat.set(segmentsAround, 1)
    },
  }
}

/** A ribbon with enough columns across to carry a torn edge. */
function createRibbonGeometry(rows: number): THREE.BufferGeometry {
  const rowCount = rows + 1
  const vertexCount = rowCount * COLUMNS
  const positions = new Float32Array(vertexCount * 3)
  const uvs = new Float32Array(vertexCount * 2)
  const indices: number[] = []

  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < COLUMNS - 1; column++) {
      const topLeft = row * COLUMNS + column
      const bottomLeft = topLeft + COLUMNS
      indices.push(topLeft, bottomLeft, topLeft + 1, topLeft + 1, bottomLeft, bottomLeft + 1)
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  return geometry
}

/**
 * The ten-segment piece. It lives in `bodyGroup`, whose origin is the torn edge,
 * so the top row is the jagged edge and the bottom row is the free end.
 */
function writeBody(
  positions: Float32Array,
  uvs: Float32Array,
  bodyTopY: number,
  bodyLength: number,
  renderLength: number,
  jag: number,
  sway: number,
  effort: number,
  time: number,
) {
  for (let row = 0; row <= BODY_ROWS; row++) {
    const alongBody = row / BODY_ROWS

    for (let column = 0; column < COLUMNS; column++) {
      const across = column / (COLUMNS - 1)
      // Only the top row wanders: it is the edge the paper tore along.
      const jagOffset = row === 0 ? jagAt(across) * jag : 0
      const localY = -bodyLength * alongBody + jagOffset
      const absoluteY = bodyTopY + localY
      const shift = sheetOffsetAt(absoluteY, renderLength, sway, effort, time)
      const vertex = row * COLUMNS + column
      const offset = vertex * 3

      positions[offset] = -PAPER.width / 2 + PAPER.width * across + shift
      positions[offset + 1] = localY
      positions[offset + 2] = 0

      uvs[vertex * 2] = across
      uvs[vertex * 2 + 1] = (renderLength + absoluteY) / params.segmentLength
    }
  }
}

/**
 * The short tail still on the roll. Its bottom row is the same jagged edge as
 * the body's top row, so the two ribbons meet while the paper is whole.
 */
function writeTail(
  positions: Float32Array,
  uvs: Float32Array,
  bodyTopY: number,
  renderLength: number,
  jag: number,
  sway: number,
  effort: number,
  time: number,
) {
  for (let row = 0; row <= TAIL_ROWS; row++) {
    const alongTail = row / TAIL_ROWS

    for (let column = 0; column < COLUMNS; column++) {
      const across = column / (COLUMNS - 1)
      // The bottom row is the torn edge; the top row stays at the roll.
      const jagOffset = row === TAIL_ROWS ? jagAt(across) * jag : 0
      const absoluteY = bodyTopY * alongTail + jagOffset
      const shift = sheetOffsetAt(absoluteY, renderLength, sway, effort, time)
      const vertex = row * COLUMNS + column
      const offset = vertex * 3

      positions[offset] = -PAPER.width / 2 + PAPER.width * across + shift
      positions[offset + 1] = absoluteY
      positions[offset + 2] = SHEET_OFFSET_Z

      uvs[vertex * 2] = across
      uvs[vertex * 2 + 1] = (renderLength + absoluteY) / params.segmentLength
    }
  }
}

/** The sheet's sideways shift at a point, measured from the top of the drawn paper. */
function sheetOffsetAt(
  absoluteY: number,
  renderLength: number,
  sway: number,
  effort: number,
  time: number,
): number {
  const alongStrip = renderLength > 0 ? clamp01(-absoluteY / renderLength) : 0
  return driftAt(alongStrip, sway, time) + sheetTremorAt(alongStrip, effort, time)
}

/**
 * The torn profile's fixed sample points. Alternating directions give the edge
 * its teeth; the seeded noise keeps the teeth from looking machined.
 */
function createJagProfile(teeth: number): number[] {
  let seed = 7
  const profile = [0]

  for (let i = 1; i <= teeth; i++) {
    seed = (seed * 9301 + 49297) % 233280
    const noise = seed / 233280
    const direction = i % 2 === 0 ? 1 : -1
    profile.push(direction * (0.45 + 0.55 * noise))
  }

  return profile
}

/** The torn edge at `across` (0..1), roughly -1..1. */
function jagAt(across: number): number {
  const position = across * (JAG_PROFILE.length - 1)
  const index = Math.min(JAG_PROFILE.length - 2, Math.floor(position))
  const blend = position - index
  return JAG_PROFILE[index] * (1 - blend) + JAG_PROFILE[index + 1] * blend
}

/**
 * Two sine waves at rates that do not line up, so the tremble never settles into
 * an obvious loop. Normalised to roughly -1..1.
 */
function tremor(time: number, rate: number, phase: number): number {
  const wobble = Math.sin(time * rate + phase) + 0.6 * Math.sin(time * rate * 1.87 + phase * 2.1)
  return wobble / 1.6
}

/** The taut sheet vibrates most at its free end and stays put where it leaves the roll. */
function sheetTremorAt(alongStrip: number, effort: number, time: number): number {
  const phase = time * 37 + alongStrip * 2.4
  const wobble = Math.sin(phase) + 0.6 * Math.sin(phase * 1.7 + 2.3)
  return (wobble / 1.6) * params.shake * 0.7 * effort * alongStrip ** 2
}

/** The far end travels the most, which reads as the loose end swinging. */
function driftAt(alongStrip: number, sway: number, time: number): number {
  return Math.sin(alongStrip * 4.2 + time * 1.9) * sway * alongStrip ** 1.5
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

/** A rip leaves immediately and settles: fast at the start, calm at the end. */
function easeOutSnap(t: number): number {
  return 1 - (1 - t) ** 3
}
