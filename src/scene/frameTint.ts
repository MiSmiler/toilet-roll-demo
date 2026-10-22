import * as THREE from 'three'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { effects } from '../params'
import { findRarity, type Rarity } from './rarity'

/**
 * How bright the white is behind its front, in multiples of white. It is added to
 * every pixel rather than laid over the frame, so the picture's own light and shade
 * wash out as the value climbs past white: an overexposure, not a card.
 */
const FLASH_PEAK = 3

/**
 * The softness of the white's front, as a share of the distance to the frame's
 * corner. A wave needs an edge to arrive on; a hard-edged disc reads as a wipe.
 */
const FLASH_EDGE = 0.14

/**
 * How far past the corners the front runs within the 0..1 the beat gives it, so a
 * beat that says the white is complete really is white to the frame's edges.
 */
const FRONT_OVERRUN = 1 + FLASH_EDGE * 2

/**
 * How much shorter the white's wave is down the frame than across it. The light
 * leaves the crack along the seam, so it is long sideways and short down the page;
 * the white keeps that shape, and the two read as one light at two moments.
 */
const WAVE_STRETCH = 0.8

/**
 * The rarity's colour read as a light. Its strongest channel is set just past the
 * paper's own white, so the hue turns under the frame without also dimming it.
 */
const TINT_BRIGHTNESS = 1.3

export type FrameTint = {
  pass: ShaderPass
  /** The frame's shape, so the wave is the same distance in every direction. */
  setAspect(aspect: number): void
  /**
   * The tear's light on the finished frame: `cover` turns the picture the rarity's
   * colour while it keeps its light and shade, and `white` is how far the white
   * that burns it has come across the frame — 0 at the centre, 1 at the corners.
   */
  update(state: { cover: number; white: number; rarity: Rarity }): void
}

/**
 * The tear's light, laid on the whole frame at once.
 *
 * It multiplies rather than covers: light falling on the picture takes the hue and
 * leaves the brightness it found, so the paper goes blue and stays a sheet of
 * paper — its folds, its torn edge and the roll behind it all still read. Laying a
 * colour over the frame instead would give the same average colour and lose every
 * one of those, which is the difference between "the light is this colour" and
 * "the page is this colour".
 *
 * The white that follows is not a fade of that colour but the same light again: a
 * front leaving the centre and travelling out, adding white to whatever it has
 * covered. A pixel is blown out over the width of the passing front rather than the
 * whole frame dimming at once, so the picture goes out in the order the wave reaches
 * it, and the eye sees the light cross the page a second time.
 */
export function createFrameTint(): FrameTint {
  const pass = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      uGlow: { value: new THREE.Color(1, 1, 1) },
      uCover: { value: 0 },
      uWhite: { value: 0 },
      uAspect: { value: 1 },
    },
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
  })

  // ShaderPass clones the uniforms it is handed, so the live values are the pass's
  // own; writing to the object above would reach a copy nobody reads.
  const { uGlow, uCover, uWhite, uAspect } = pass.uniforms

  return {
    pass,

    setAspect(aspect) {
      uAspect.value = aspect
    },

    update({ cover, white, rarity }) {
      const shown = effects.whiteout
      pass.enabled = shown
      if (!shown) return

      uCover.value = cover
      uWhite.value = white
      // Normalised by the strongest channel rather than by luminance: a blue light
      // makes white paper blue and a touch darker, which is what it does in life.
      // Luminance-normalised blue would only be a brighter picture.
      const glow = findRarity(rarity).glow
      const strongest = Math.max(glow.r, glow.g, glow.b)
      uGlow.value.copy(glow).multiplyScalar(TINT_BRIGHTNESS / strongest)
    },
  }
}

const VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform vec3 uGlow;
  uniform float uCover;
  uniform float uWhite;
  uniform float uAspect;

  varying vec2 vUv;

  void main() {
    vec4 scene = texture2D(tDiffuse, vUv);
    vec3 tinted = mix(scene.rgb, scene.rgb * uGlow, uCover);

    // Where the white has got to. Distance is measured in a square frame so it is
    // the same in every direction, then squeezed along the crack, then scaled so 1
    // is the frame's corner — the same "how far out" the flood's own front counts in.
    vec2 across = (vUv - 0.5) * vec2(${WAVE_STRETCH.toFixed(3)}, 1.0);
    float corner = length(vec2(0.5 * uAspect * ${WAVE_STRETCH.toFixed(3)}, 0.5));
    float reach = length(across * vec2(uAspect, 1.0)) / corner;

    float front = uWhite * ${FRONT_OVERRUN.toFixed(3)};
    float burnt = 1.0 - smoothstep(front - ${FLASH_EDGE.toFixed(3)}, front + ${FLASH_EDGE.toFixed(3)}, reach);
    // A front sitting on the centre still burns its own edge there, which would leave
    // a glow in the middle of an untouched frame. Nothing is burnt before it leaves.
    burnt *= step(0.0001, uWhite);

    gl_FragColor = vec4(tinted + vec3(${FLASH_PEAK.toFixed(1)}) * burnt, scene.a);
  }
`
