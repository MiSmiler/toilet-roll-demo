import * as THREE from 'three'
import { effects } from '../params'
import type { TearBeat } from '../tear/timeline'
import { findRarity, type Rarity } from './rarity'
import { SPECTRUM_GLSL, UNEVEN_GLSL } from './tearLine'

/**
 * The flood is a light and not a shape: it has to reach past the frame on every
 * side, so it is drawn on the same 26-unit sheet the charge's shadow uses.
 */
const SIZE = 26

/**
 * Where the front starts and ends, measured through the squeezed frame the
 * shader uses. It starts as a sliver no wider than the crack, and ends past the
 * frame's corners, which sit about 6.3 units out at the framing a full pull
 * leaves — measured, not guessed: the corners stay dark if the front stops
 * short, and the front's own unevenness eats half a unit of the margin.
 */
const FRONT_START = 0.14
const FRONT_END = 7.6

/**
 * How much white the leading band is mixed toward. The band is the light arriving, so
 * it has to still be the rarity's colour: the tear has to pick up the colour the seam
 * wore a moment before, or the two shots do not join.
 */
const BAND_PALE = 0.25

/**
 * How much white the crack line itself is mixed toward. Small like the band's: the
 * hairline is brighter than the seam it replaces, but it is still the seam's colour.
 */
const CRACK_PALE = 0.3

/**
 * The prism's fringe around the front: where it sits in multiples of the front's
 * own width, how wide it is, and how many spectral cycles it runs through. The
 * colour is ordered outwards, so a short run of cycles reads as a rainbow and a
 * long one as a colour wheel.
 */
const FRINGE_START = 0.9
const FRINGE_SPREAD = 1.1
const SPECTRUM_CYCLES = 0.28

/** How fast the whole spectrum turns, in cycles per second. Slow: a prism, not a wheel. */
const SPECTRUM_DRIFT = 0.1

/** How bright the fringe is next to the front it rings. */
const SPECTRUM_GAIN = 0.9

export type TearBurst = {
  object: THREE.Mesh
  /**
   * The light that leaves the crack once the paper gives way. It starts with
   * `torn` and stops when the paper is whole again. When it happens is the
   * timeline's; this only draws it.
   */
  update(state: {
    x: number
    y: number
    torn: boolean
    beat: TearBeat
    dt: number
    rarity: Rarity
  }): void
}

/**
 * The moment the paper gives way, drawn as light rather than as debris.
 *
 * The crack is already the brightest thing on screen when it parts, so the burst
 * has to continue the seam rather than appear beside it: white where the paper
 * broke, the rarity's own colour further out, and an uneven front that runs with
 * the crack — long along it, short across it — before settling into a wash that
 * takes the whole frame in that colour. The bloom pass turns whatever runs past
 * white into a halo, so the front is pushed well past it.
 *
 * The white follows the colour rather than replacing it: as the frame fills in the
 * rarity's colour, that colour is what bleaches, and the white it leaves hands the
 * screen over to whatever comes next.
 */
export function createTearBurst(): TearBurst {
  const uniforms = {
    uTime: { value: 0 },
    uFront: { value: FRONT_START },
    uWash: { value: 0 },
    uStrike: { value: 0 },
    uSpectrum: { value: 0 },
    uCore: { value: new THREE.Color() },
    uGlow: { value: new THREE.Color() },
  }

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    // Nothing in this shot casts a shadow, and the flood lands on the frame as a
    // whole: the paper does not get to punch a hole in the light.
    depthTest: false,
    // The same screen blend as the seam, so the flood adds light to the page
    // instead of replacing what is behind it.
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneMinusDstColorFactor,
    blendDst: THREE.OneFactor,
    blendSrcAlpha: THREE.OneMinusDstAlphaFactor,
    blendDstAlpha: THREE.OneFactor,
  })

  const object = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE), material)
  object.frustumCulled = false
  // After the seam, after the sparks: the flood is the last thing drawn.
  object.renderOrder = 6
  object.position.z = 0.02
  object.visible = false

  return {
    object,

    update({ x, y, torn, beat, dt, rarity }) {
      object.visible = torn && effects.burst
      if (!torn) return

      uniforms.uTime.value += dt
      uniforms.uFront.value = FRONT_START + beat.flood * (FRONT_END - FRONT_START)
      uniforms.uWash.value = beat.flood
      uniforms.uStrike.value = beat.strike

      const look = findRarity(rarity)
      uniforms.uSpectrum.value = effects.prism ? look.spectrum : 0
      uniforms.uCore.value.copy(look.core)
      uniforms.uGlow.value.copy(look.light)

      object.position.x = x
      object.position.y = y
    },
  }
}

const VERTEX_SHADER = /* glsl */ `
  varying vec2 vLocal;

  void main() {
    // The plane is square and centred on the crack, so its own coordinates are
    // already world units measured from the crack.
    vLocal = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const FRAGMENT_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uFront;
  uniform float uWash;
  uniform float uStrike;
  uniform float uSpectrum;
  uniform vec3 uCore;
  uniform vec3 uGlow;

  varying vec2 vLocal;

  ${UNEVEN_GLSL}
  ${SPECTRUM_GLSL}

  void main() {
    // The crack runs across the paper, so the light runs with it: measured
    // through this squeezed frame, a circle in the shader is an ellipse long
    // along the seam and short across it.
    vec2 squeezed = vLocal * vec2(0.5, 2.0);
    float reach = length(squeezed);

    // The front does not leave as a circle either: it finds the places that gave
    // way first, with the same unevenness the seam had before it opened.
    float angle = atan(vLocal.y, vLocal.x);
    float wobble = uneven(angle * 2.6 + 7.0) - 0.5;
    // Held to a fraction of the way the front still has to travel, and capped:
    // a front that wanders wider than it has come leaves corners dark forever.
    float front = uFront + wobble * min(0.5, uFront * 0.35);

    // The air the front has just crossed is the brightest thing in the frame, so
    // the flood reads as a band travelling out rather than as a disc fading up.
    float bandWidth = 0.25 + front * 0.2;
    float band = exp(-pow((reach - front) / bandWidth, 2.0)) * (1.0 - uWash);

    // Behind the front the frame keeps what the band left, and the light is
    // slow to settle: it lags the front by most of the frame.
    float filled = 1.0 - smoothstep(front - 0.6, front, reach);
    float settle = 0.35 + 0.7 * uWash;

    // The crack itself, kept a thin hot line outliving the seam by a heartbeat. It is
    // the seam's own colour, only hotter: the tear has to look like the strain that
    // was there a frame ago, or the two shots cut rather than join.
    float crack = exp(-pow(vLocal.y / 0.05, 2.0)) * (1.0 - smoothstep(0.0, 1.6, abs(vLocal.x)));

    // Slow unevenness across the flooded frame, so the wash has some structure
    // instead of being one flat tint, and a memory of where the light came from.
    float body = 0.88 + 0.24 * uneven(angle * 1.1 + 3.0);
    float nearCrack = 0.7 + 0.3 * (1.0 - smoothstep(0.0, 2.2, reach));

    // The corners are held back while the front is still on its way, so the frame
    // ends flooded rather than blank. Once it lands they come in too: the ground
    // the white closes over has to be one colour, or the white would be erasing a
    // picture instead of continuing the light.
    float corners = 1.0 - 0.45 * smoothstep(0.55, 1.6, length(vLocal)) * (1.0 - uWash);

    // The prism is a second ring rather than a repaint of the first, and it rings
    // the outside of the front, ordered outwards the way a real prism orders
    // colour: the flood arrives gold at its leading edge and the spectrum circles
    // it, a full rainbow out of the tools it has.
    float beyond = (reach - front) / bandWidth;
    float fringe = exp(-pow((beyond - (${FRINGE_START.toFixed(2)} + 1.0)) / ${FRINGE_SPREAD.toFixed(2)}, 2.0)) * (1.0 - uWash);
    float hue = (beyond - ${FRINGE_START.toFixed(2)}) * ${SPECTRUM_CYCLES.toFixed(2)} + uTime * ${SPECTRUM_DRIFT.toFixed(2)};

    vec3 light = uGlow * filled * settle * body * nearCrack
               + mix(uGlow, vec3(1.0), ${BAND_PALE.toFixed(2)}) * band * 1.8
               + hueToLight(hue) * fringe * ${SPECTRUM_GAIN.toFixed(2)} * uSpectrum
               + mix(uGlow, vec3(1.0), ${CRACK_PALE.toFixed(2)}) * crack * 2.5 * uStrike;

    gl_FragColor = vec4(light * corners, 0.0);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`
