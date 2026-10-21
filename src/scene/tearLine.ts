import * as THREE from 'three'
import { STRAIN_FLOOR } from '../paper/feed'
import { findRarity, type Rarity } from './rarity'

/**
 * Half the beam's width: it reaches well past the paper on both sides, because
 * it is a cut across the scene rather than a mark on the sheet.
 */
const BEAM_REACH = 1.8

/** The hot centre of the beam, as thick as a hair on screen. */
const CORE_THICKNESS = 0.006

/** How far the warm spill reaches away from the core. */
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
 * The halo the charge throws around the cut: half its size in world units. It
 * reaches wider than the beam because it is the room lit up, not the cut.
 */
const AURA_HALF_WIDTH = 2.8
const AURA_HALF_HEIGHT = 1.5

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
   * the pull is past the end: it tints the beam towards `rarity`, lights the
   * halo around it and sinks the rest of the prop into shadow.
   */
  update(state: {
    x: number
    y: number
    active: boolean
    time: number
    strain: number
    rarity: Rarity
  }): void
}

/**
 * The line that marks where the paper can be cut, and everything the charge
 * builds around it.
 *
 * The cut itself is drawn as light rather than as ink: the sheet is nearly
 * white already, so a brighter line is the only thing that can sit on it and
 * still read as something happening to the paper. The beam is screened over
 * the frame, so off the sheet it glows against the dark backdrop and over the
 * sheet it keeps a hairline — and the perforation underneath stays legible as
 * notches in it.
 *
 * Charging then changes the picture: the prop is multiplied into shadow while a
 * halo of thin, slowly turning spikes breathes around the cut, one breath per
 * beat and the beat quickening as the paper nears giving way. The shadow is
 * what makes the light read as light.
 */
export function createTearLine(): TearLine {
  const width = BEAM_REACH * 2
  // Shared by the beam and the halo, so the tint is lerped once per frame.
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
  beam.renderOrder = 3

  const auraUniforms = {
    uTime: { value: 0 },
    uCharge: { value: 0 },
    uHalf: { value: new THREE.Vector2(AURA_HALF_WIDTH, AURA_HALF_HEIGHT) },
    uCore: { value: coreColor },
    uGlow: { value: glowColor },
  }

  const halo = new THREE.Mesh(
    new THREE.PlaneGeometry(AURA_HALF_WIDTH * 2, AURA_HALF_HEIGHT * 2),
    new THREE.ShaderMaterial({
      uniforms: auraUniforms,
      vertexShader: VERTEX_SHADER,
      fragmentShader: AURA_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      // The halo sits behind the sheet, so the paper hides the part of the burst
      // it is standing in front of: the light comes from behind it, not from the
      // viewer's side.
      depthTest: true,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneMinusDstColorFactor,
      blendDst: THREE.OneFactor,
      blendSrcAlpha: THREE.OneMinusDstAlphaFactor,
      blendDstAlpha: THREE.OneFactor,
    }),
  )
  halo.frustumCulled = false
  // Behind the sheet, in front of the roll.
  halo.position.z = -0.004
  // Behind the beam, so the cut stays the sharpest thing in the frame.
  halo.renderOrder = 2

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
  // A hair behind the beam and the halo, but in front of every lit surface.
  veil.position.z = -0.001
  veil.renderOrder = 1

  const object = new THREE.Group()
  object.add(veil, halo, beam)
  object.visible = false

  /** Scene time when the cut started opening, null while the line is away. */
  let appearedAt: number | null = null

  return {
    object,

    update({ x, y, active, time, strain, rarity }) {
      object.visible = active
      if (!active) {
        appearedAt = null
        return
      }

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
      auraUniforms.uTime.value = time
      auraUniforms.uCharge.value = charge
      veilUniforms.uCharge.value = charge

      appearedAt ??= time
      const progress = Math.min(1, (time - appearedAt) / OPENING_SECONDS)
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

  void main() {
    // World units: x across the beam, y out from its centre line.
    float x = vUv.x * uWidth;
    float y = (vUv.y - 0.5) * uHeight;

    // The cut opens from the paper outwards, so the first thing the eye gets is
    // the paper lighting up, not a light arriving from off screen.
    float reach = abs(x - uWidth * 0.5);
    float opening = 1.0 - smoothstep(uOpen - 0.12, uOpen, reach);

    float fromLine = abs(y);
    float core = 1.0 - smoothstep(uThickness * 0.5, uThickness * 0.5 + fwidth(y), fromLine);

    // The rarer the cut, the brighter and the further its light spills, while
    // the hairline over the paper stays a hairline.
    float gain = mix(1.0, uGain, uCharge);
    float spread = uSpread * mix(1.0, 1.8, uCharge);
    float spill = exp(-pow(fromLine / spread, 2.0));

    // Neither end stops dead: the beam dissolves into the backdrop.
    float ends = smoothstep(0.0, uEndFade, min(x, uWidth - x));

    // A slow, shallow flicker keeps it reading as a live beam, not a sticker.
    float flicker = 0.94 + 0.06 * sin(uTime * 3.1);
    float intensity = opening * ends * flicker * uFlash * (core * 0.6 + spill * 0.16 * gain);

    // Screen blend wants rgb already scaled by its own strength, with that
    // strength carried in alpha.
    gl_FragColor = vec4(mix(uGlow, uCore, core) * intensity, intensity);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

const AURA_FRAGMENT_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uCharge;
  uniform vec2 uHalf;
  uniform vec3 uCore;
  uniform vec3 uGlow;

  varying vec2 vUv;

  void main() {
    // World units from the cut, which the plane is centred on.
    vec2 p = (vUv - 0.5) * 2.0 * uHalf;
    float r = length(p / uHalf);

    // Thin spikes turning slowly: the light looks like it is straining out
    // through cracks rather than like a painted star. Two layers keep them from
    // reading as a regular gear.
    float spine = atan(p.y, p.x) + uTime * 0.3;
    float spikes = pow(0.5 + 0.5 * sin(spine * 13.0), 18.0)
                 + 0.7 * pow(0.5 + 0.5 * sin(spine * 23.0 + 1.1), 26.0);
    // A slow, uneven glow across the fan, so the spokes are not all equally
    // loud and the burst looks like it is breathing rather than spinning.
    spikes *= 0.6 + 0.4 * sin(spine * 2.0 + uTime * 0.6);
    float rays = spikes * exp(-r * 2.6);

    // The bed the spikes sit on: a soft pool of light around the cut. It is
    // kept low in the middle so the paper's own surface still reads there.
    float corona = exp(-r * 6.0) * 0.45 + exp(-r * 2.0) * 0.2;

    // One breath per beat thrown outwards, the beat quickening as the charge
    // fills, so the whole thing reads as something winding up.
    float beatRate = 1.5 + 6.5 * uCharge;
    float beat = 0.5 + 0.5 * sin(uTime * beatRate);
    float pulse = fract(uTime * beatRate / 6.2831853);
    float ring = exp(-pow((r - pulse * 1.3) * 13.0, 2.0)) * (1.0 - pulse);
    // The ring has to die before the plane's own edge.
    ring *= 1.0 - smoothstep(0.6, 1.0, r);

    float border = 1.0 - smoothstep(0.75, 1.0, r);
    float strength = pow(uCharge, 1.6) * (0.4 + 0.6 * beat);
    float intensity = (rays * 0.26 + corona * 0.3) * strength * border + ring * strength * 0.35;

    gl_FragColor = vec4(mix(uGlow, uCore, exp(-r * 3.0) * 0.75) * intensity, intensity);

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
    float fromCut = length((vUv - 0.5) * uSize);
    // The light falls off from the cut rather than the whole prop going flat
    // grey: near the line the paper keeps its own light, and away from it the
    // prop recedes, so the frame has one obvious place to look.
    float shadow = uCharge * mix(0.1, 1.0, smoothstep(0.08, 0.85, fromCut));
    gl_FragColor = vec4(mix(vec3(1.0), uShadow, shadow), 1.0);

    #include <colorspace_fragment>
  }
`

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}
