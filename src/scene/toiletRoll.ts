import * as THREE from 'three'
import { PAPER, params } from '../params'
import { createRollTexture, createSheetTexture } from './paperTextures'
import { createTearLine } from './tearLine'

const STRIP_ROWS = 72
const STRIP_COLUMNS = 2

/** Lifts the sheet a hair off the roll so the tangent line never z-fights. */
const SHEET_OFFSET_Z = PAPER.rollRadius + 0.006

export type PaperState = {
  /** Unrolled length in world units. */
  length: number
  /** Sideways drift amplitude in world units. */
  sway: number
  /** How hard the pull is straining past the end, 0..1. */
  strain: number
  time: number
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
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(PAPER.rollRadius, PAPER.rollRadius, PAPER.width, 72, 1, true),
    rollMaterial,
  )
  body.rotation.z = Math.PI / 2
  spinner.add(body)

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
  const sheetGeometry = createSheetGeometry()
  const sheet = new THREE.Mesh(sheetGeometry, sheetMaterial)
  // The strip is rewritten every frame, so a stale bounding sphere would cull it.
  sheet.frustumCulled = false
  object.add(sheet)

  const tearLine = createTearLine()
  // Fixed in front of the sheet; only its x and y follow the paper.
  tearLine.object.position.z = SHEET_OFFSET_Z + 0.002
  object.add(tearLine.object)

  const sheetPositions = sheetGeometry.attributes.position.array as Float32Array

  const enabled: PaperParts = { roll: true, sheet: true, tearLine: true }
  /** Length currently drawn, kept so bounds() can answer without arguments. */
  let drawnLength = params.segmentLength

  return {
    object,

    show(parts) {
      Object.assign(enabled, parts)
      spinner.visible = enabled.roll
      sheet.visible = enabled.sheet
    },

    parts: () => ({ ...enabled }),

    bounds() {
      // Wide enough for the sheet's sway, tremble and tilt, deep enough to cover
      // the roll's curve behind the sheet.
      const margin = params.shake * 3
      const halfWidth = PAPER.width / 2 + params.sway + margin
      return new THREE.Box3(
        new THREE.Vector3(-halfWidth, PAPER.rollCenterY - drawnLength - margin, -PAPER.rollRadius),
        new THREE.Vector3(halfWidth, PAPER.rollCenterY + PAPER.rollRadius + margin, SHEET_OFFSET_Z + 0.01),
      )
    },

    setPaper({ length, sway, strain, time }) {
      // One segment always hangs below the last counted one, so the tear line
      // never sits on the paper's own edge.
      const renderLength = length + params.segmentLength
      drawnLength = renderLength

      // The strain already carries a half-strength floor, so the tremble is
      // visible the moment the paper goes taut and grows from there.
      const effort = strain

      // Roll and sheet share the group's tremble. The roll adds a twist and the
      // sheet's free end whips further, so the prop reads as strained rather
      // than as one rigid object being shaken.
      object.position.x = tremor(time, 41, 0) * params.shake * effort
      object.position.y = PAPER.rollCenterY + tremor(time, 57, 1.7) * params.shake * effort * 0.6
      object.rotation.z = tremor(time, 33, 3.1) * 0.0015 * effort

      spinner.rotation.x = length / PAPER.rollRadius + tremor(time, 67, 0.9) * 0.015 * effort

      writeSheet(sheetPositions, renderLength, sway, effort, time)
      sheetGeometry.attributes.position.needsUpdate = true

      // Segments are numbered from the free end, so the tear line sits ten
      // segments above it. It only clears the roll near the end of the pull.
      const tearY = -(renderLength - params.maxSegments * params.segmentLength)
      const alongStrip = renderLength > 0 ? -tearY / renderLength : 0

      tearLine.update({
        x: driftAt(alongStrip, sway, time) + sheetTremorAt(alongStrip, effort, time),
        y: tearY,
        active: tearY <= 0 && enabled.tearLine,
        time,
      })

      // One texture tile per segment keeps the perforations the same physical
      // size no matter how much paper is out.
      sheetTexture.repeat.set(1, Math.max(renderLength / params.segmentLength, 0.0001))
      const segmentsAround = Math.max(1, Math.round((2 * Math.PI * PAPER.rollRadius) / params.segmentLength))
      rollTexture.repeat.set(segmentsAround, 1)
    },
  }
}

/**
 * A two-column ribbon. The position buffer is rewritten in place because the
 * strip changes length every frame.
 */
function createSheetGeometry(): THREE.BufferGeometry {
  const rowCount = STRIP_ROWS + 1
  const vertexCount = rowCount * STRIP_COLUMNS
  const positions = new Float32Array(vertexCount * 3)
  const uvs = new Float32Array(vertexCount * 2)
  const indices: number[] = []

  for (let row = 0; row < rowCount; row++) {
    const v = 1 - row / STRIP_ROWS
    for (let column = 0; column < STRIP_COLUMNS; column++) {
      const vertex = row * STRIP_COLUMNS + column
      uvs[vertex * 2] = column
      uvs[vertex * 2 + 1] = v
    }
  }

  for (let row = 0; row < STRIP_ROWS; row++) {
    const topLeft = row * STRIP_COLUMNS
    const bottomLeft = topLeft + STRIP_COLUMNS
    indices.push(topLeft, bottomLeft, topLeft + 1, topLeft + 1, bottomLeft, bottomLeft + 1)
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  return geometry
}

function writeSheet(
  positions: Float32Array,
  length: number,
  sway: number,
  effort: number,
  time: number,
) {
  const halfWidth = PAPER.width / 2

  for (let row = 0; row <= STRIP_ROWS; row++) {
    const alongStrip = row / STRIP_ROWS
    const shift = driftAt(alongStrip, sway, time) + sheetTremorAt(alongStrip, effort, time)

    for (let column = 0; column < STRIP_COLUMNS; column++) {
      const offset = (row * STRIP_COLUMNS + column) * 3
      positions[offset] = (column === 0 ? -halfWidth : halfWidth) + shift
      positions[offset + 1] = -length * alongStrip
      positions[offset + 2] = SHEET_OFFSET_Z
    }
  }
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
