import * as THREE from 'three'

/**
 * Half the beam's width: it reaches well past the paper on both sides, because
 * it is a cut across the scene rather than a mark on the sheet.
 */
const BEAM_REACH = 1.8

/** The hot centre of the beam, as thick as a hair on screen. */
const CORE_THICKNESS = 0.006

/** How far the warm spill reaches away from the core. */
const GLOW_SPREAD = 0.034

/** Each end fades over this much of the beam instead of stopping dead. */
const END_FADE = 0.5

/** Tall enough for the spill to fade out well before the band's edge. */
const BAND_HEIGHT = 0.24

/** How long the cut takes to open, from the paper outwards. */
const REVEAL_SECONDS = 0.3

const CORE_COLOR = '#ff8c2a'
const GLOW_COLOR = '#c25a10'

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
 * something happening to the paper. The beam is additive, so off the sheet it
 * glows against the dark backdrop and over the sheet it simply overexposes —
 * and the perforation underneath stays legible as notches in the light.
 */
export function createTearLine(): TearLine {
  const width = BEAM_REACH * 2
  const uniforms = {
    uWidth: { value: width },
    uHeight: { value: BAND_HEIGHT },
    uThickness: { value: CORE_THICKNESS },
    uSpread: { value: GLOW_SPREAD },
    uEndFade: { value: END_FADE },
    uReveal: { value: 0 },
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
    blending: THREE.AdditiveBlending,
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
      uniforms.uReveal.value = Math.min(1, (time - appearedAt) / REVEAL_SECONDS)
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
  uniform float uReveal;
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
    float openTo = uReveal * (uWidth * 0.5 + 0.2);
    float opening = 1.0 - smoothstep(openTo - 0.12, openTo, reach);

    float fromLine = abs(y);
    float core = 1.0 - smoothstep(uThickness * 0.5, uThickness * 0.5 + fwidth(y), fromLine);
    float spill = exp(-pow(fromLine / uSpread, 2.0));

    // Neither end stops dead: the beam dissolves into the backdrop.
    float ends = smoothstep(0.0, uEndFade, min(x, uWidth - x));

    // A slow, shallow flicker keeps it reading as a live beam, not a sticker.
    float flicker = 0.94 + 0.06 * sin(uTime * 3.1);
    float intensity = opening * ends * flicker * (core * 0.75 + spill * 0.45);

    // Premultiplied: the renderer adds rgb straight into the framebuffer, and
    // the page composites that over its own background.
    gl_FragColor = vec4(mix(uGlow, uCore, core) * intensity, intensity);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`
