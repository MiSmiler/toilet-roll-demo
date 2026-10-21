import * as THREE from 'three'

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

/** White, but a touch cool: next to the paper's own warmth it reads whiter. */
const CORE_COLOR = '#ffffff'
const GLOW_COLOR = '#dce8ff'

export type TearLine = {
  object: THREE.Mesh
  /**
   * Puts the line across the paper at `y`, in the paper's local space, keeping
   * `x` in step with the sheet's drift. The line only becomes visible while
   * `active`, and opens up the first time it is asked to.
   */
  update(state: { x: number; y: number; active: boolean; time: number }): void
}

/**
 * The line that marks where the paper can be cut.
 *
 * It is drawn as light rather than as ink: the sheet is nearly white already,
 * so a brighter line is the only thing that can sit on it and still read as
 * something happening to the paper. The beam is screened over the frame, so off
 * the sheet it glows against the dark backdrop and over the sheet it keeps a
 * hairline — and the perforation underneath stays legible as notches in it.
 */
export function createTearLine(): TearLine {
  const width = BEAM_REACH * 2
  const uniforms = {
    uWidth: { value: width },
    uHeight: { value: BAND_HEIGHT },
    uThickness: { value: CORE_THICKNESS },
    uSpread: { value: GLOW_SPREAD },
    uEndFade: { value: END_FADE },
    uOpen: { value: 0 },
    uFlash: { value: 1 },
    uTime: { value: 0 },
    uCore: { value: new THREE.Color(CORE_COLOR) },
    uGlow: { value: new THREE.Color(GLOW_COLOR) },
  }

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
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

  const object = new THREE.Mesh(new THREE.PlaneGeometry(width, BAND_HEIGHT), material)
  // The line is rewritten every frame, so a stale bounding sphere would cull it.
  object.frustumCulled = false
  object.visible = false

  /** Scene time when the cut started opening, null while the line is away. */
  let appearedAt: number | null = null

  return {
    object,

    update({ x, y, active, time }) {
      object.visible = active
      if (!active) {
        appearedAt = null
        return
      }

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

const FRAGMENT_SHADER = /* glsl */ `
  uniform float uWidth;
  uniform float uHeight;
  uniform float uThickness;
  uniform float uSpread;
  uniform float uEndFade;
  uniform float uOpen;
  uniform float uFlash;
  uniform float uTime;
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
    float spill = exp(-pow(fromLine / uSpread, 2.0));

    // Neither end stops dead: the beam dissolves into the backdrop.
    float ends = smoothstep(0.0, uEndFade, min(x, uWidth - x));

    // A slow, shallow flicker keeps it reading as a live beam, not a sticker.
    float flicker = 0.94 + 0.06 * sin(uTime * 3.1);
    float intensity = opening * ends * flicker * uFlash * (core * 0.6 + spill * 0.16);

    // Screen blend wants rgb already scaled by its own strength, with that
    // strength carried in alpha.
    gl_FragColor = vec4(mix(uGlow, uCore, core) * intensity, intensity);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`
