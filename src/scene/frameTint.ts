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
 * The width of the light's coloured rim, as a share of the distance to the frame's
 * corner. The rim is the light as it arrives — the rarity's colour, which is the
 * colour the seam wore before it gave way, so the tear is continuous with the pull —
 * and it is the only part of the wave the page is still readable through.
 */
const RIM = 0.28

/**
 * How far inside the rim the light has burnt out to white. Everything deeper than this
 * is the same light, too strong to keep a colour.
 */
const BURNT = 0.32

/**
 * How far out the light has to be before the white is allowed to burn. While the wave
 * is still leaving the crack the frame has to be the colour the seam wore; the white
 * is what the same light becomes further along, so it may not be there first.
 */
const BURNT_FROM = 0.02
const BURNT_BY = 0.18

/**
 * How bright the burnt light is, in multiples of white. It is added to the picture
 * rather than laid over it, so the frame's own light and shade wash out as the value
 * climbs past white: an overexposure, not a card.
 */
const FLASH_PEAK = 3

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
 * The first is the burst's own colour, and it is a rim rather than a wash: the wave is
 * a ring of the rarity's colour travelling out from the crack with white already burnt
 * in behind it. So the first frame of the tear is the seam's own colour leaving, and
 * the white follows the rim outwards — never the other way round. The rim multiplies
 * the picture, so the page's folds and torn edge stay readable through it; the white
 * behind it is added light, piled until the tone mapping gives up.
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
    // How deep inside the wave this pixel is: positive behind the rim, negative ahead
    // of it, in shares of the distance to the corner.
    float depth = front - reach;
    float inside = smoothstep(-${EDGE.toFixed(3)}, ${EDGE.toFixed(3)}, depth);
    // A front sitting on the centre still covers its own edge there, which would tint
    // the middle of an untouched frame. Nothing is lit before it leaves.
    inside *= step(0.0001, uLight);

    // The rim is the light as it arrives: the rarity's colour, on the outside of the
    // wave, where the page is still a page. Inside it the same light has already burnt
    // out, so the white grows behind the colour and never the other way round.
    float rim = inside * (1.0 - smoothstep(0.0, ${RIM.toFixed(3)}, depth));
    // How far inside that rim the light has burnt out, once it is far enough out to be
    // burning at all.
    float burnt = smoothstep(0.0, ${BURNT.toFixed(3)}, depth)
                * smoothstep(${BURNT_FROM.toFixed(3)}, ${BURNT_BY.toFixed(3)}, front);

    vec3 tinted = scene.rgb * mix(vec3(1.0), uGlow, rim);
    vec3 lightColour = mix(uGlow, vec3(1.0), burnt);
    float power = ${FLASH_PEAK.toFixed(1)} * burnt * inside;

    // The white that closes the shot: broad, soft, and out of the centre.
    float veilFront = uVeil * ${VEIL_OVERRUN.toFixed(3)};
    float veil = 1.0 - smoothstep(veilFront - ${VEIL_EDGE.toFixed(3)}, veilFront + ${VEIL_EDGE.toFixed(3)}, reach);
    veil *= step(0.0001, uVeil);

    gl_FragColor = vec4(mix(tinted + lightColour * power, vec3(${VEIL_WHITE.toFixed(1)}), veil), scene.a);
  }
`
