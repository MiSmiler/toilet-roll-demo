import * as THREE from 'three'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { effects } from '../params'
import { findRarity, type Rarity } from './rarity'

/**
 * The rarity's light set past the paper's own white, so it is brighter than
 * everything it lands on and the hue turns under the frame without dimming it.
 */
const TINT_BRIGHTNESS = 1.7

/**
 * The softness of the colour's edge, as a share of the distance to the frame's
 * corner. The light arrives from the crack with a soft edge, so the ground takes its
 * colour gradually rather than being switched.
 */
const EDGE = 0.14

/**
 * How far past the corners the colour runs within the 0..1 the beat gives it, so a
 * beat that says the light has crossed really has the frame's edges tinted.
 */
const FRONT_OVERRUN = 1 + EDGE

/**
 * How much shorter the light's wave is down the frame than across it. It leaves the
 * crack along the seam, so it is long sideways and short down the page, and it takes
 * the sides well before it takes the top and bottom — the same shape the flood has,
 * because it is the same light.
 */
const WAVE_STRETCH = 0.4

/**
 * How soft the closing white is, and how far past the corners it runs at full
 * coverage. Softer than the colour's edge on purpose: this is a fade across the
 * frame, not a front with an arrival.
 */
const VEIL_EDGE = 0.35
const VEIL_OVERRUN = 1 + VEIL_EDGE

/**
 * What the veil fades toward. Not white, but past it: this pass sits before the tone
 * mapping, so a plain 1.0 comes out of it as light grey, and the last frame of the
 * shot has to be the same white as light rather than a slightly dimmer page.
 */
const VEIL_WHITE = 6

export type FrameTint = {
  pass: ShaderPass
  /** The frame's shape, so the wave is the same distance in every direction. */
  setAspect(aspect: number): void
  /**
   * The tear's light on the finished frame: `light` is how far the rarity's colour
   * has come from the crack — 0 there, 1 at the corners — and `veil` is how far the
   * white that ends the shot has closed over the frame.
   */
  update(state: { light: number; veil: number; rarity: Rarity }): void
}

/**
 * The tear's two lights, at the two moments they own.
 *
 * The first is the burst's own colour: light leaving the crack, turning the page under
 * it and leaving its folds and torn edge readable, because it multiplies the picture
 * rather than covering it. It is not made white here — the halo gaining strength is
 * what whitens the frame, so the colour is the last thing to go and it goes by being
 * outshone rather than by being mixed away.
 *
 * The second is the white that closes the shot. It fades in from the centre over a
 * broad edge, so the frame is taken by a gradient rather than switched, and it is a
 * fade toward white rather than more added light: by then the frame is already too
 * bright to keep any detail, and what is left to do is take the light's colour off it.
 */
export function createFrameTint(): FrameTint {
  const pass = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      uGlow: { value: new THREE.Color(1, 1, 1) },
      uLight: { value: 0 },
      uVeil: { value: 0 },
      uAspect: { value: 1 },
    },
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
  })

  // ShaderPass clones the uniforms it is handed, so the live values are the pass's
  // own; writing to the object above would reach a copy nobody reads.
  const { uGlow, uLight, uVeil, uAspect } = pass.uniforms

  return {
    pass,

    setAspect(aspect) {
      uAspect.value = aspect
    },

    update({ light, veil, rarity }) {
      const shown = effects.whiteout
      pass.enabled = shown
      if (!shown) return

      uLight.value = light
      uVeil.value = veil
      // The rarity's light, scaled by its strongest channel so the tint is bright
      // rather than dark: it has to read as light falling on the page.
      const glow = findRarity(rarity).light
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
  uniform float uLight;
  uniform float uVeil;
  uniform float uAspect;

  varying vec2 vUv;

  void main() {
    vec4 scene = texture2D(tDiffuse, vUv);

    // Distance from the centre, measured in a square frame so it is the same in every
    // direction, squeezed along the crack, then scaled so 1 is the frame's corner.
    vec2 across = (vUv - 0.5) * vec2(${WAVE_STRETCH.toFixed(3)}, 1.0);
    float corner = length(vec2(0.5 * uAspect * ${WAVE_STRETCH.toFixed(3)}, 0.5));
    float reach = length(across * vec2(uAspect, 1.0)) / corner;

    float front = uLight * ${FRONT_OVERRUN.toFixed(3)};
    float lit = 1.0 - smoothstep(front - ${EDGE.toFixed(3)}, front + ${EDGE.toFixed(3)}, reach);
    // A front sitting on the centre still covers its own edge there, which would
    // tint the middle of an untouched frame. Nothing is lit before it leaves.
    lit *= step(0.0001, uLight);
    vec3 tinted = scene.rgb * mix(vec3(1.0), uGlow, lit);

    // The white that closes the shot: broad, soft, and out of the centre.
    float veilFront = uVeil * ${VEIL_OVERRUN.toFixed(3)};
    float veil = 1.0 - smoothstep(veilFront - ${VEIL_EDGE.toFixed(3)}, veilFront + ${VEIL_EDGE.toFixed(3)}, reach);
    veil *= step(0.0001, uVeil);

    gl_FragColor = vec4(mix(tinted, vec3(${VEIL_WHITE.toFixed(1)}), veil), scene.a);
  }
`
