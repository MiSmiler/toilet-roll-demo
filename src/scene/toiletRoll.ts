import * as THREE from 'three'
import { PAPER, params } from '../params'
import { createRollTexture, createSheetTexture } from './paperTextures'

const STRIP_ROWS = 72
const STRIP_COLUMNS = 2
/** Lifts the sheet a hair off the roll so the tangent line never z-fights. */
const SHEET_OFFSET_Z = PAPER.rollRadius + 0.006

export type PaperState = {
  /** Unrolled length in world units. */
  length: number
  /** Sideways drift amplitude in world units. */
  sway: number
  time: number
}

export type ToiletRoll = {
  object: THREE.Group
  setPaper(state: PaperState): void
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

  const sheetPositions = sheetGeometry.attributes.position.array as Float32Array

  return {
    object,
    setPaper({ length, sway, time }) {
      // Feeding paper over the top turns the roll by length / radius.
      spinner.rotation.x = length / PAPER.rollRadius

      writeSheet(sheetPositions, length, sway, time)
      sheetGeometry.attributes.position.needsUpdate = true

      // One texture tile per segment keeps the perforations the same physical
      // size no matter how much paper is out.
      sheetTexture.repeat.set(1, Math.max(length / params.segmentLength, 0.0001))
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

function writeSheet(positions: Float32Array, length: number, sway: number, time: number) {
  const halfWidth = PAPER.width / 2

  for (let row = 0; row <= STRIP_ROWS; row++) {
    const alongStrip = row / STRIP_ROWS
    // The far end travels the most, which reads as the loose end swinging.
    const drift = Math.sin(alongStrip * 4.2 + time * 1.9) * sway * alongStrip ** 1.5

    for (let column = 0; column < STRIP_COLUMNS; column++) {
      const offset = (row * STRIP_COLUMNS + column) * 3
      positions[offset] = (column === 0 ? -halfWidth : halfWidth) + drift
      positions[offset + 1] = -length * alongStrip
      positions[offset + 2] = SHEET_OFFSET_Z
    }
  }
}
