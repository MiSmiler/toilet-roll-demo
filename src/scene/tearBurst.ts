import * as THREE from 'three'
import { effects } from '../params'
import { findRarity, type Rarity } from './rarity'
import { UNEVEN_GLSL } from './tearLine'

/**
 * The flood is a light and not a shape: it has to reach past the frame on every
 * side, so it is drawn on the same 26-unit sheet the charge's shadow uses.
 */
const SIZE = 26

/** How long the light takes to cross the frame. */
const FLOOD_SECONDS = 0.75

/** It leaves the crack fast and arrives slowly, like a wave losing its push. */
const FLOOD_SHARPNESS = 2.0

/**
 * Where the front starts and ends, measured through the squeezed frame the
 * shader uses. It starts as a sliver no wider than the crack, and ends past the
 * frame's corners, which sit about 6.3 units out at the framing a full pull
 * leaves — measured, not guessed: the corners stay dark if the front stops
 * short, and the front's own unevenness eats half a unit of the margin.
 */
const FRONT_START = 0.14
const FRONT_END = 7.6

/** How long the white of the crack outlasts the strike, in seconds. */
const STRIKE_SECONDS = 0.16

export type TearBurst = {
  object: THREE.Mesh
  /**
   * The light that leaves the crack once the paper gives way. It starts with
   * `torn` and stops when the paper is whole again, and it runs on `dt` rather
   * than on the scene clock, so a script that freezes the clock still gets a
   * flooded frame instead of a half-open one.
   */
  update(state: { x: number; y: number; torn: boolean; dt: number; rarity: Rarity }): void
  /** Pins how far into the flood a script wants the frame, or lets it run again. */
  holdAt(seconds: number | null): void
}

/**
 * The moment the paper gives way, drawn as light rather than as debris.
 *
 * The crack is already the brightest thing on screen when it parts, so the burst
 * has to continue the seam rather than appear beside it: white where the paper
 * broke, the rarity's own colour further out, and an uneven front that runs with
 * the crack — long along it, short across it — before settling into a wash that
 * holds the frame. The bloom pass turns whatever runs past white into a halo, so
 * the front is pushed well past it.
 */
export function createTearBurst(): TearBurst {
  const uniforms = {
    uTime: { value: 0 },
    uFront: { value: FRONT_START },
    uWash: { value: 0 },
    uStrike: { value: 0 },
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

  /** Seconds since the tear, and the age a script has pinned, if any. */
  let age = 0
  let heldAge: number | null = null

  return {
    object,

    holdAt(seconds) {
      heldAge = seconds
    },

    update({ x, y, torn, dt, rarity }) {
      object.visible = torn && effects.burst
      if (!torn) {
        age = 0
        return
      }

      age = heldAge ?? age + dt
      uniforms.uTime.value += dt

      const progress = clamp01(age / FLOOD_SECONDS)
      const eased = 1 - (1 - progress) ** FLOOD_SHARPNESS

      uniforms.uFront.value = FRONT_START + eased * (FRONT_END - FRONT_START)
      uniforms.uWash.value = eased
      uniforms.uStrike.value = clamp01(1 - age / STRIKE_SECONDS)
      uniforms.uCore.value.copy(findRarity(rarity).core)
      uniforms.uGlow.value.copy(findRarity(rarity).glow)

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
  uniform vec3 uCore;
  uniform vec3 uGlow;

  varying vec2 vLocal;

  ${UNEVEN_GLSL}

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

    // The crack itself, white and thin, outliving the seam by a heartbeat.
    float crack = exp(-pow(vLocal.y / 0.05, 2.0)) * (1.0 - smoothstep(0.0, 1.6, abs(vLocal.x)));

    // Slow unevenness across the flooded frame, so the wash has some structure
    // instead of being one flat tint, and a memory of where the light came from.
    float body = 0.88 + 0.24 * uneven(angle * 1.1 + 3.0);
    float nearCrack = 0.7 + 0.3 * (1.0 - smoothstep(0.0, 2.2, reach));

    // The corners are held back, so the frame ends flooded rather than blank:
    // there is still a picture in there to hand over to the next act.
    float corners = 1.0 - 0.45 * smoothstep(0.55, 1.6, length(vLocal));

    vec3 light = uGlow * filled * settle * body * nearCrack
               + mix(uGlow, vec3(1.0), 0.75) * band * 1.8
               + vec3(1.0) * crack * 2.5 * uStrike;

    gl_FragColor = vec4(light * corners, 0.0);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}
