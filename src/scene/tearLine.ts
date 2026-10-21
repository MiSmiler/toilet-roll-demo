import * as THREE from 'three'
import { STRAIN_FLOOR } from '../paper/feed'
import { effects } from '../params'
import { findRarity, type Rarity } from './rarity'
import { createSeamSparks } from './seamSparks'

/**
 * Half the beam's width: it reaches well past the paper on both sides, because
 * it is a cut across the scene rather than a mark on the sheet.
 */
const BEAM_REACH = 1.8

/** How thick the seam is at rest, before the pull forces it open. */
const CORE_THICKNESS = 0.006

/** How far the thin spill reaches away from the seam. */
const GLOW_SPREAD = 0.02

/** Each end fades over this much of the beam instead of stopping dead. */
const END_FADE = 0.5

/** Tall enough for the spill to fade out well before the band's edge. */
const BAND_HEIGHT = 0.24

/** How long the cut takes to run from the paper out to the ends of the beam. */
const OPENING_SECONDS = 0.5

/**
 * How hard the cut slows down on its way out. Higher means it leaves the paper
 * faster and spends longer settling into its ends.
 */
const OPENING_SHARPNESS = 3

/**
 * How much brighter the beam flares as it strikes, over its resting level. The
 * flare is spent by the time the cut reaches the ends.
 */
const STRIKE_FLASH = 0.5

/**
 * The pool of light lying along the seam: half its size in world units. It is
 * much flatter than the beam, because light leaking out of a gap washes the
 * surface around it rather than shooting out in a shape of its own.
 */
const SEAM_HALF_WIDTH = 1.8
const SEAM_HALF_HEIGHT = 1.0

/**
 * The veil is a filter rather than a shape, so it covers the whole frame: it
 * dims whatever it lands on, and the backdrop is not in the frame buffer.
 */
const VEIL_SIZE = 26

/** What the veil multiplies the prop down to as the charge fills. */
const VEIL_SHADOW = '#b3bac8'

/** White, but a touch cool: next to the paper's own warmth it reads whiter. */
const WHITE_CORE = new THREE.Color('#ffffff')
const WHITE_GLOW = new THREE.Color('#dce8ff')

export type TearLine = {
  object: THREE.Group
  /**
   * Puts the line across the paper at `y`, in the paper's local space, keeping
   * `x` in step with the sheet's drift. The line only becomes visible while
   * `active`, and opens up the first time it is asked to. `strain` is how hard
   * the pull is past the end: it forces the seam wider, washes the prop with the
   * light escaping it and sinks the rest of the prop into shadow.
   *
   * The opening runs on `dt` rather than on the scene clock: it is a transition,
   * so a script that freezes the clock still gets a fully open cut.
   */
  update(state: {
    x: number
    y: number
    active: boolean
    time: number
    dt: number
    strain: number
    rarity: Rarity
  }): void
}

/**
 * The line that marks where the paper can be cut, and the light the pull forces
 * out of it.
 *
 * The cut itself is drawn as light rather than as ink: the sheet is nearly
 * white already, so a brighter line is the only thing that can sit on it and
 * still read as something happening to the paper. It is not a stripe being
 * drawn but a seam being opened: it thickens as the pull strains, and along its
 * length it is uneven, brighter where it has already given way.
 *
 * Charging then changes the picture the way a lid giving way would: the prop is
 * multiplied into shadow while the light escaping the seam washes the surfaces
 * around it, so the frame has one bright ridge and everything else falls back.
 * Where the light runs past white the bloom pass takes over and turns the
 * excess into a real halo.
 */
export function createTearLine(): TearLine {
  const width = BEAM_REACH * 2
  // Shared by the seam and the beam, so the tint is lerped once per frame.
  const coreColor = WHITE_CORE.clone()
  const glowColor = WHITE_GLOW.clone()

  const uniforms = {
    uWidth: { value: width },
    uHeight: { value: BAND_HEIGHT },
    uThickness: { value: CORE_THICKNESS },
    uSpread: { value: GLOW_SPREAD },
    uEndFade: { value: END_FADE },
    uOpen: { value: 0 },
    uFlash: { value: 1 },
    uTime: { value: 0 },
    uCharge: { value: 0 },
    uGain: { value: 1 },
    uCore: { value: coreColor },
    uGlow: { value: glowColor },
  }

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERTEX_SHADER,
    fragmentShader: BEAM_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    // Screen rather than plain add: light added to a surface that is already
    // bright barely shows, so the paper keeps a hairline while the pool of
    // light around it stays readable against the dark backdrop.
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneMinusDstColorFactor,
    blendDst: THREE.OneFactor,
    blendSrcAlpha: THREE.OneMinusDstAlphaFactor,
    blendDstAlpha: THREE.OneFactor,
  })

  const beam = new THREE.Mesh(new THREE.PlaneGeometry(width, BAND_HEIGHT), material)
  // The line is rewritten every frame, so a stale bounding sphere would cull it.
  beam.frustumCulled = false
  // Last of all: the cut is the sharpest thing in the frame.
  beam.renderOrder = 4

  const seamUniforms = {
    uTime: { value: 0 },
    uCharge: { value: 0 },
    uHalf: { value: new THREE.Vector2(SEAM_HALF_WIDTH, SEAM_HALF_HEIGHT) },
    uCore: { value: coreColor },
    uGlow: { value: glowColor },
  }

  const seam = new THREE.Mesh(
    new THREE.PlaneGeometry(SEAM_HALF_WIDTH * 2, SEAM_HALF_HEIGHT * 2),
    new THREE.ShaderMaterial({
      uniforms: seamUniforms,
      vertexShader: VERTEX_SHADER,
      fragmentShader: SEAM_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      // Light is not a surface and nothing in this shot casts a shadow, so the
      // seam's glow is laid over the frame whole: the paper never cuts a hole.
      depthTest: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneMinusDstColorFactor,
      blendDst: THREE.OneFactor,
      blendSrcAlpha: THREE.OneMinusDstAlphaFactor,
      blendDstAlpha: THREE.OneFactor,
    }),
  )
  seam.frustumCulled = false
  seam.renderOrder = 2

  const veilUniforms = {
    uCharge: { value: 0 },
    uSize: { value: VEIL_SIZE },
    uShadow: { value: new THREE.Color(VEIL_SHADOW) },
  }

  const veil = new THREE.Mesh(
    new THREE.PlaneGeometry(VEIL_SIZE, VEIL_SIZE),
    new THREE.ShaderMaterial({
      uniforms: veilUniforms,
      vertexShader: VERTEX_SHADER,
      fragmentShader: VEIL_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      // Three insists on premultiplied alpha for a multiply blend.
      premultipliedAlpha: true,
      blending: THREE.MultiplyBlending,
    }),
  )
  veil.frustumCulled = false
  // A hair behind the light, but in front of every lit surface.
  veil.position.z = -0.001
  veil.renderOrder = 1

  // Motes and sparks live in the same space as the prop, so the paper hides the
  // ones behind it and the light does not merely sit on the screen.
  const sparks = createSeamSparks()

  const object = new THREE.Group()
  object.add(veil, seam, sparks.object, beam)
  object.visible = false

  /** Seconds the cut has been open, so the intro survives a frozen clock. */
  let openedFor = 0

  return {
    object,

    update({ x, y, active, time, dt, strain, rarity }) {
      object.visible = active
      if (!active) {
        openedFor = 0
        return
      }

      // The dust and sparks share the seam's group but not its switch: the light
      // and the debris can be judged apart.
      veil.visible = effects.shadow
      sparks.object.visible = effects.particles

      // The cut is white whenever the paper is merely taut; the colour only
      // arrives with the effort of pulling past the end, so the tint itself is
      // what tells the player how rare the cut is turning out. A taut paper
      // already carries the strain floor, so the charge counts from there.
      const look = findRarity(rarity)
      const charge = clamp01((strain - STRAIN_FLOOR) / (1 - STRAIN_FLOOR))
      coreColor.copy(WHITE_CORE).lerp(look.core, charge)
      glowColor.copy(WHITE_GLOW).lerp(look.glow, charge)

      uniforms.uCharge.value = charge
      uniforms.uGain.value = look.glowGain
      seamUniforms.uTime.value = time
      seamUniforms.uCharge.value = charge
      veilUniforms.uCharge.value = charge
      sparks.update({ time, charge, core: coreColor, glow: glowColor })

      openedFor += dt
      const progress = Math.min(1, openedFor / OPENING_SECONDS)
      // Fast out of the paper, then easing into the ends: the beam looks released
      // rather than dragged out at one speed. The flare burns off over the same
      // curve, which is what lets the beam arrive calm.
      const eased = 1 - (1 - progress) ** OPENING_SHARPNESS

      // The front has to clear the beam's end and its own soft edge before the
      // whole length is lit.
      uniforms.uOpen.value = eased * (BEAM_REACH + 0.2)
      uniforms.uFlash.value = 1 + STRIKE_FLASH * (1 - eased)

      uniforms.uTime.value = time
      object.position.x = x
      object.position.y = y
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

/**
 * Shared by both light shaders, and by the burst that follows them: one seam
 * cannot be uneven two different ways, before or after it opens.
 */
export const UNEVEN_GLSL = /* glsl */ `
  float hash(float n) {
    return fract(sin(n * 127.1) * 43758.5453);
  }

  float valueNoise(float x) {
    float lower = floor(x);
    float blend = fract(x);
    blend = blend * blend * (3.0 - 2.0 * blend);
    return mix(hash(lower), hash(lower + 1.0), blend);
  }

  // Light does not leak out of a crack evenly: it finds the places that gave
  // way first. Three octaves of noise, drifting at different rates, so the
  // unevenness never repeats along the seam. Roughly 0..1.
  float uneven(float x) {
    float drift = uTime * 0.12;
    return 0.55 * valueNoise(x * 1.6 + drift)
         + 0.3 * valueNoise(x * 4.3 - drift * 1.7)
         + 0.15 * valueNoise(x * 9.7 + drift * 0.6);
  }
`

const BEAM_FRAGMENT_SHADER = /* glsl */ `
  uniform float uWidth;
  uniform float uHeight;
  uniform float uThickness;
  uniform float uSpread;
  uniform float uEndFade;
  uniform float uOpen;
  uniform float uFlash;
  uniform float uTime;
  uniform float uCharge;
  uniform float uGain;
  uniform vec3 uCore;
  uniform vec3 uGlow;

  varying vec2 vUv;

  ${UNEVEN_GLSL}

  void main() {
    // World units: x across the seam, y out from it.
    float x = vUv.x * uWidth;
    float y = (vUv.y - 0.5) * uHeight;

    // The cut opens from the paper outwards, so the first thing the eye gets is
    // the paper lighting up, not a light arriving from off screen.
    float reach = abs(x - uWidth * 0.5);
    float opening = 1.0 - smoothstep(uOpen - 0.12, uOpen, reach);

    float knot = pow(uneven(x * 1.9), 4.0);
    float fromSeam = abs(y);

    // Forced wider by the pull, and wider still where it has already given way:
    // this is a gap being opened, not a stripe being drawn.
    float halfWidth = uThickness * (0.5 + 1.6 * uCharge) * (0.7 + 0.9 * knot);
    float core = 1.0 - smoothstep(halfWidth, halfWidth + fwidth(y), fromSeam);

    float spread = uSpread * mix(1.0, 1.8, uCharge);
    float spill = exp(-pow(fromSeam / spread, 2.0)) * (0.6 + 0.8 * knot);

    // Neither end stops dead: the seam dissolves into the backdrop.
    float ends = smoothstep(0.0, uEndFade, min(x, uWidth - x));

    // A slow, shallow flicker keeps it reading as live, not as a sticker.
    float flicker = 0.94 + 0.06 * sin(uTime * 3.1);
    float gain = mix(1.0, uGain, uCharge);

    // The seam is pushed past white on purpose: the bloom pass is what turns
    // that excess into light instead of into a flat bright stripe.
    float intensity = opening * ends * flicker * uFlash * (core * 0.95 + spill * 0.22 * gain);

    // Alpha stays at zero: the canvas composites premultiplied, so light pours
    // onto the page over the backdrop instead of replacing it.
    gl_FragColor = vec4(mix(uGlow, uCore, core) * intensity, 0.0);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

const SEAM_FRAGMENT_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uCharge;
  uniform vec2 uHalf;
  uniform vec3 uCore;
  uniform vec3 uGlow;

  varying vec2 vUv;

  ${UNEVEN_GLSL}

  void main() {
    // World units from the seam, which the plane is centred on.
    vec2 p = (vUv - 0.5) * 2.0 * uHalf;
    float knot = pow(uneven(p.x * 1.9), 4.0);

    // The wash reaches further where the seam has opened most, so its edge is a
    // ridge rather than a clean gradient. It spills further below the seam than
    // above it, because that is the side the freed paper hangs on.
    float spillBias = p.y > 0.0 ? 0.7 : 1.0;
    float reach = (0.1 + 0.2 * knot + 0.06 * uCharge) * spillBias;
    float wash = exp(-pow(abs(p.y) / reach, 2.0));

    // The light comes out of the paper, not out of the air beside it.
    float ends = 1.0 - smoothstep(uHalf.x * 0.6, uHalf.x, abs(p.x));
    float strength = pow(uCharge, 1.5) * (0.3 + 0.9 * knot);
    float intensity = wash * ends * strength * 0.4;

    // Clear alpha for the same reason as the beam: light adds to the page.
    gl_FragColor = vec4(mix(uGlow, uCore, exp(-abs(p.y) / reach)) * intensity, 0.0);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

const VEIL_FRAGMENT_SHADER = /* glsl */ `
  uniform float uCharge;
  uniform float uSize;
  uniform vec3 uShadow;

  varying vec2 vUv;

  void main() {
    // A plain multiply, so only what the scene drew is affected: the prop sinks
    // into shadow and the backdrop, which is not in the frame buffer, is left
    // alone. It is the shadow that lets the charge read as light.
    float fromSeam = length((vUv - 0.5) * uSize);
    // The light falls off from the seam rather than the whole prop going flat
    // grey: around the seam the paper keeps its own light, and away from it the
    // prop recedes, so the frame has one obvious place to look.
    float shadow = uCharge * smoothstep(0.05, 0.8, fromSeam);
    gl_FragColor = vec4(mix(vec3(1.0), uShadow, shadow), 1.0);

    #include <colorspace_fragment>
  }
`

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}
