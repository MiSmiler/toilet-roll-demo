import * as THREE from 'three'
import { PAPER, params } from '../params'

/**
 * Both paper textures draw one texel per this many world units, so a
 * perforation comes out the same physical size on the roll and on the sheet,
 * and the roll's copy of it can continue the sheet's line at the join.
 */
const TEXELS_PER_UNIT = 256

/** One segment across the paper, and one segment along it, in texels. */
const ACROSS = Math.round(PAPER.width * TEXELS_PER_UNIT)
const ALONG = Math.round(params.segmentLength * TEXELS_PER_UNIT)

/** One dash of a perforation, in texels, so both papers stay in step. */
const PERFORATION = {
  color: 'rgba(146, 136, 120, 0.5)',
  width: 2.5,
  dash: [7, 8],
}

/**
 * One segment of toilet paper: a plain sheet with a perforation along its upper
 * tile edge.
 *
 * The line straddles the tile edge on purpose, so each neighbouring tile draws
 * half of it and the two halves join into one dash across the boundary. That is
 * what lets the roll's own perforation pick the line up at the join: both are
 * the same physical line, drawn once on either side of it.
 */
export function createSheetTexture(): THREE.Texture {
  const canvas = document.createElement('canvas')
  canvas.width = ACROSS
  canvas.height = ALONG
  const ctx = canvas.getContext('2d')!

  paintPaper(ctx, canvas.width, canvas.height)

  ctx.strokeStyle = PERFORATION.color
  ctx.lineWidth = PERFORATION.width
  ctx.setLineDash(PERFORATION.dash)
  ctx.beginPath()
  for (const y of [0, canvas.height]) {
    ctx.moveTo(0, y)
    ctx.lineTo(canvas.width, y)
  }
  ctx.stroke()

  return finishTexture(canvas, 8)
}

/**
 * The same paper wrapped on the roll. Perforations run parallel to the roll's
 * axis, so the tile carries them on its left and right edges and repeats around
 * the circumference.
 *
 * A perforation at u = 0 is also what the roll turns to the tangent: one whole
 * segment of feed is a quarter turn, which brings the next perforation exactly
 * where the previous one left, so the join never falls between two of them.
 */
export function createRollTexture(): THREE.Texture {
  const canvas = document.createElement('canvas')
  canvas.width = ALONG
  canvas.height = ACROSS
  const ctx = canvas.getContext('2d')!

  paintPaper(ctx, canvas.width, canvas.height)

  ctx.strokeStyle = PERFORATION.color
  ctx.lineWidth = PERFORATION.width
  ctx.setLineDash(PERFORATION.dash)
  ctx.beginPath()
  for (const x of [0, canvas.width]) {
    ctx.moveTo(x, 0)
    ctx.lineTo(x, canvas.height)
  }
  ctx.stroke()

  return finishTexture(canvas, 8)
}

/**
 * One dash of the tear line. A warm tint is used because it has to read both
 * on the white paper and on the dark backdrop the line pokes out into.
 */
export function createTearLineTexture(): THREE.Texture {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 16
  const ctx = canvas.getContext('2d')!

  ctx.strokeStyle = '#ffd49c'
  ctx.lineWidth = 8
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(5, 8)
  ctx.lineTo(34, 8)
  ctx.stroke()

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  return texture
}

function paintPaper(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.fillStyle = '#fffdf7'
  ctx.fillRect(0, 0, width, height)

  // A hint of fibre so the white does not read as flat plastic.
  for (let i = 0; i < 900; i++) {
    const x = Math.random() * width
    const y = Math.random() * height
    const shade = 210 + Math.random() * 45
    ctx.fillStyle = `rgba(${shade}, ${shade - 4}, ${shade - 14}, 0.35)`
    ctx.fillRect(x, y, 1, 1)
  }
}

function finishTexture(canvas: HTMLCanvasElement, anisotropy: number): THREE.Texture {
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.anisotropy = anisotropy
  return texture
}
