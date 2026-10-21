import * as THREE from 'three'

/** Slow motes hanging in the light. Enough to give the air thickness. */
const DUST_COUNT = 260

/** Bright ones thrown out of the seam; fast and short lived, so they streak. */
const SPARK_COUNT = 220

/** How far along the seam the particles are born, in world units. */
const SEAM_HALF_WIDTH = 1.4

/**
 * A fixed pool of points whose whole life is computed on the GPU from `uTime`
 * and their own seed, so nothing is allocated or updated per frame. Seeds are
 * derived from the index, so every run and every screenshot has the same
 * particles in the same places.
 */
export type SeamSparks = {
  object: THREE.Group
  /**
   * `charge` is what lights them: each particle has its own threshold, so the
   * air fills up gradually instead of switching on at once. `core` and `glow`
   * are the seam's current colours, shared rather than copied.
   */
  update(state: { time: number; charge: number; core: THREE.Color; glow: THREE.Color }): void
}

export function createSeamSparks(): SeamSparks {
  const pixelRatio = Math.min(window.devicePixelRatio, 2)

  const dustUniforms = {
    uTime: { value: 0 },
    uCharge: { value: 0 },
    uPixelRatio: { value: pixelRatio },
    uHalfWidth: { value: SEAM_HALF_WIDTH },
    uCore: { value: new THREE.Color('#ffffff') },
    uGlow: { value: new THREE.Color('#ffffff') },
  }

  const dust = createPoints(DUST_COUNT, dustUniforms, DUST_VERTEX_SHADER, DUST_FRAGMENT_SHADER)

  const sparkUniforms = {
    uTime: { value: 0 },
    uCharge: { value: 0 },
    uPixelRatio: { value: pixelRatio },
    uHalfWidth: { value: SEAM_HALF_WIDTH },
    uCore: { value: new THREE.Color('#ffffff') },
    uGlow: { value: new THREE.Color('#ffffff') },
  }

  const sparks = createPoints(
    SPARK_COUNT,
    sparkUniforms,
    SPARK_VERTEX_SHADER,
    SPARK_FRAGMENT_SHADER,
  )

  const object = new THREE.Group()
  object.add(dust, sparks)

  return {
    object,

    update({ time, charge, core, glow }) {
      dustUniforms.uTime.value = time
      dustUniforms.uCharge.value = charge
      dustUniforms.uCore.value.copy(core)
      dustUniforms.uGlow.value.copy(glow)

      sparkUniforms.uTime.value = time
      sparkUniforms.uCharge.value = charge
      sparkUniforms.uCore.value.copy(core)
      sparkUniforms.uGlow.value.copy(glow)
    },
  }
}

/**
 * Points with one `seed` per particle. The vertex shader places them, so the
 * `position` attribute is only there to keep three happy; the bounding sphere is
 * meaningless and culling is off.
 */
function createPoints(
  count: number,
  uniforms: Record<string, THREE.IUniform>,
  vertexShader: string,
  fragmentShader: string,
): THREE.Points {
  const seeds = new Float32Array(count)
  for (let index = 0; index < count; index++) seeds[index] = seedOf(index)

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3))
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    // The depth test is the whole point: motes behind the paper are hidden by
    // it and motes in front of it are not, which is what makes them read as
    // being in the room rather than on the screen.
    depthTest: true,
    // Same screen blend and clear alpha as the seam's own light, so a particle
    // pours light onto the page instead of painting a dark patch over it.
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneMinusDstColorFactor,
    blendDst: THREE.OneFactor,
    blendSrcAlpha: THREE.OneMinusDstAlphaFactor,
    blendDstAlpha: THREE.OneFactor,
  })

  const points = new THREE.Points(geometry, material)
  points.frustumCulled = false
  points.renderOrder = 3
  return points
}

/** Deterministic and spread out, so every run has the same motes. */
function seedOf(index: number): number {
  const raw = Math.sin(index * 12.9898 + 78.233) * 43758.5453
  return raw - Math.floor(raw)
}

const RANDOM_GLSL = /* glsl */ `
  // One seed per particle, salted per use: a handful of independent numbers
  // from one attribute, so the pool needs nothing but a seed each.
  float rnd(float seed, float salt) {
    return fract(sin(seed * 78.233 + salt * 12.9898) * 43758.5453);
  }
`

const DUST_VERTEX_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uCharge;
  uniform float uPixelRatio;
  uniform float uHalfWidth;
  uniform vec3 uCore;
  uniform vec3 uGlow;

  attribute float aSeed;

  varying float vAlpha;
  varying vec3 vColor;

  ${RANDOM_GLSL}

  void main() {
    float seed = aSeed;

    // Each mote drifts on its own slow cycle, from a point of its own.
    float cycle = fract(uTime * (0.05 + 0.08 * rnd(seed, 1.0)) + rnd(seed, 2.0));
    float side = rnd(seed, 3.0) < 0.5 ? -1.0 : 1.0;
    float away = 0.02 + cycle * (0.12 + 0.3 * rnd(seed, 4.0));

    // Some in front of the sheet and some behind it: the ones behind are the
    // reason the light reads as filling a space.
    vec3 pos = vec3(
      (rnd(seed, 5.0) - 0.5) * 2.0 * uHalfWidth * (0.5 + 0.5 * rnd(seed, 6.0))
        + sin(uTime * (0.4 + rnd(seed, 7.0)) + seed * 6.283) * 0.02,
      side * away,
      (rnd(seed, 8.0) - 0.6) * 0.9
    );

    // Each mote has its own charge threshold, so the air fills up with the pull
    // instead of all of it appearing at once.
    float threshold = rnd(seed, 9.0);
    float lit = smoothstep(threshold, threshold + 0.2, uCharge);
    float lifespan = smoothstep(0.0, 0.15, cycle) * (1.0 - smoothstep(0.6, 1.0, cycle));

    vAlpha = lit * lifespan * (0.3 + 0.7 * rnd(seed, 10.0)) * (1.0 - smoothstep(0.15, 0.5, abs(pos.y)));
    vColor = mix(uGlow, uCore, 0.3 + 0.4 * rnd(seed, 11.0));

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    gl_PointSize = (1.4 + 2.2 * rnd(seed, 12.0)) * uPixelRatio;
  }
`

const DUST_FRAGMENT_SHADER = /* glsl */ `
  varying float vAlpha;
  varying vec3 vColor;

  void main() {
    vec2 offset = gl_PointCoord - 0.5;
    float soft = exp(-dot(offset, offset) * 15.0);
    float intensity = soft * vAlpha * 0.75;

    if (!(intensity > 0.002)) discard;

    gl_FragColor = vec4(vColor * intensity, 0.0);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

const SPARK_VERTEX_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uCharge;
  uniform float uPixelRatio;
  uniform float uHalfWidth;
  uniform vec3 uCore;
  uniform vec3 uGlow;

  attribute float aSeed;

  varying float vAlpha;
  varying vec3 vColor;
  varying float vAngle;

  ${RANDOM_GLSL}

  void main() {
    float seed = aSeed;

    // A spark is gone in a fifth of a second, then it waits before it is thrown
    // again. It has to be fast and numerous: sparks are a shower, and a few big
    // ones read as shards falling rather than as a shower.
    float lifetime = 0.16 + 0.14 * rnd(seed, 1.0);
    float cycleDuration = lifetime * (1.0 + 3.0 * rnd(seed, 2.0));
    float cycle = fract(uTime / cycleDuration + rnd(seed, 3.0));
    float age = cycle * cycleDuration / lifetime;
    float alive = step(age, 1.0);

    float threshold = rnd(seed, 4.0);
    float lit = smoothstep(threshold, threshold + 0.2, uCharge);

    vec3 origin = vec3(
      (rnd(seed, 5.0) - 0.5) * 2.0 * uHalfWidth * 0.8,
      (rnd(seed, 6.0) - 0.5) * 0.04,
      (rnd(seed, 7.0) - 0.6) * 0.5
    );
    // The harder the pull, the harder it sprays. Sparks leave a crack sideways
    // and upwards, so the throw is spread against both sides of the seam before
    // gravity pulls it back.
    float throwPower = 0.6 + 0.8 * uCharge;
    vec3 velocity = vec3(
      (rnd(seed, 8.0) - 0.5) * 6.0,
      (rnd(seed, 9.0) - 0.42) * 7.0,
      (rnd(seed, 10.0) - 0.5) * 1.6
    ) * throwPower;

    // Ballistic: it leaves fast, gets dragged back and falls.
    float flight = age * lifetime;
    vec3 pos = origin + velocity * flight + vec3(0.0, -12.0, 0.0) * flight * flight;

    // A spent spark rests at age > 1 until its cycle comes round again, and
    // anything computed from an unbounded age is off its range: pow() of a
    // negative base is a NaN, mix() extrapolates to negative colours, and one
    // NaN rides the bloom pass across the whole frame. So age is clamped here
    // and the burn is written without pow at all.
    float cooled = clamp(age, 0.0, 1.0);
    float burn = 1.0 - cooled;

    // It burns out rather than fading like a lamp: white-hot for the first
    // instant, then its own colour, then an ember that is almost out.
    vAlpha = alive * lit * burn * sqrt(burn) * (0.4 + 0.6 * rnd(seed, 11.0));
    vColor = mix(mix(uGlow, uCore, 0.45), uGlow * 0.6, cooled);

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);

    // The sprite is as long as the distance covered in a frame would be, so the
    // streak stands in for a motion blur three cannot afford.
    float speed = length(velocity);
    gl_PointSize = (3.0 + speed * 1.5) * uPixelRatio;

    // Screen-space direction of travel. Clip space counts y upwards and the
    // sprite's own coordinates count it downwards, hence the flip.
    vec3 ahead = (modelViewMatrix * vec4(pos + normalize(velocity + vec3(0.0, -0.001, 0.0)) * 0.08, 1.0)).xyz;
    vec4 aheadClip = projectionMatrix * vec4(ahead, 1.0);
    vec2 here = gl_Position.xy / max(gl_Position.w, 0.0001);
    vec2 there = aheadClip.xy / max(aheadClip.w, 0.0001);
    vAngle = atan(-(there.y - here.y), there.x - here.x);
  }
`

const SPARK_FRAGMENT_SHADER = /* glsl */ `
  varying float vAlpha;
  varying vec3 vColor;
  varying float vAngle;

  void main() {
    vec2 offset = gl_PointCoord - 0.5;
    float cosine = cos(vAngle);
    float sine = sin(vAngle);
    vec2 along = vec2(offset.x * cosine + offset.y * sine, -offset.x * sine + offset.y * cosine);

    // A head with a tail behind it, the tail thinning as it goes: a dot moving
    // fast leaves a line, and a line with a hot end reads as something thrown.
    float head = clamp((along.x + 0.5) * 1.33, 0.0, 1.0);
    float width = mix(0.035, 0.1, head);
    float across = along.y / width;
    float body = exp(-across * across * 2.0);
    float tail = pow(head, 1.1);
    float tip = smoothstep(0.85, 1.0, head);

    float intensity = body * (tail * 1.1 + tip * 1.0) * vAlpha * 2.2;

    if (!(intensity > 0.002)) discard;

    gl_FragColor = vec4(vColor * intensity, 0.0);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`
