import * as THREE from 'three'
import type { FrameWash } from '../scene/tearBurst'
import { findRarity, type Rarity } from '../scene/rarity'

export type Whiteout = {
  /**
   * Lays the tear's wash over the screen in `rarity`'s own colour, or takes the
   * layer away again when there is no wash to show.
   */
  set(wash: FrameWash | null, rarity: Rarity): void
}

/**
 * The screen the tear ends on: the burst's light settles into the rarity's
 * colour across the whole frame, and that colour bleaches to white.
 *
 * It is a layer over the page rather than part of the burst's own plane because
 * the flood can only add light, and added light leaves white paper white. To get
 * a frame that is one colour, the paper and the vignette have to be covered
 * rather than lit — which is what a layer does, and what a second one would do
 * for the white, so this one carries both: the colour, then the bleach.
 */
export function createWhiteout(host: HTMLElement): Whiteout {
  const white = new THREE.Color('#ffffff')
  let shown = ''

  return {
    set(wash, rarity) {
      const coverage = wash?.coverage ?? 0
      const bleach = wash?.bleach ?? 0
      const colour = findRarity(rarity).glow.clone().lerp(white, bleach)
      const background = `#${colour.getHexString()}`
      const key = `${background} ${coverage.toFixed(3)}`

      // This runs every frame, and only the last two thirds of a second change it.
      if (key === shown) return
      shown = key
      host.style.background = background
      host.style.opacity = coverage.toFixed(3)
    },
  }
}
