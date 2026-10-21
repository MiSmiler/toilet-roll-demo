import * as THREE from 'three'

/**
 * One segment of toilet paper: a plain sheet with a dashed perforation along
 * its lower edge. Tiling this along the strip puts a perforation exactly on
 * every segment boundary.
 */
export function createSheetTexture(): THREE.Texture {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 205
  const ctx = canvas.getContext('2d')!

  paintPaper(ctx, canvas.width, canvas.height)

  ctx.strokeStyle = 'rgba(146, 136, 120, 0.5)'
  ctx.lineWidth = 2.5
  ctx.setLineDash([7, 8])
  ctx.beginPath()
  ctx.moveTo(0, canvas.height - 5)
  ctx.lineTo(canvas.width, canvas.height - 5)
  ctx.stroke()

  return finishTexture(canvas, 8)
}

/**
 * The same idea for the roll: perforations run parallel to the roll axis, so
 * the tile carries one vertical dashed line and is repeated around the
 * circumference.
 */
export function createRollTexture(): THREE.Texture {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 256
  const ctx = canvas.getContext('2d')!

  paintPaper(ctx, canvas.width, canvas.height)

  ctx.strokeStyle = 'rgba(146, 136, 120, 0.42)'
  ctx.lineWidth = 2
  ctx.setLineDash([6, 9])
  ctx.beginPath()
  ctx.moveTo(3, 0)
  ctx.lineTo(3, canvas.height)
  ctx.stroke()

  return finishTexture(canvas, 4)
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
