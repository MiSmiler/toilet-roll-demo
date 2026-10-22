import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { effects, params } from '../params'
import type { TearBeat } from '../tear/timeline'

/** The camera keeps its sideways angle throughout the pull. */
const CAMERA_X = 1.05

/**
 * Linear brightness a pixel needs before it blooms. The paper sits below it, so
 * only the cut's own light — which is deliberately pushed past white — spills
 * over into a halo.
 */
const BLOOM_THRESHOLD = 1.0

/** How much of that spilled light is added back over the frame. */
const BLOOM_STRENGTH = 0.55

/** How far the halo reaches; a wide, soft radius reads as air, a tight one as a smear. */
const BLOOM_RADIUS = 0.5

export type Stage = {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  /**
   * Frames this pull progress, and reads the tear's jolt off `beat`. The camera
   * has one owner: whatever the pull asks for, plus the break's knock on top.
   */
  setPull(progress: number, beat: TearBeat): void
  /**
   * Holds the scene clock at `at` seconds, so a script can shoot several frames
   * with the same animation phase; null lets it run again.
   */
  freezeTime(at: number | null): void
  onFrame(render: (dt: number, elapsed: number) => void): void
}

export function createStage(canvas: HTMLCanvasElement): Stage {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05

  const scene = new THREE.Scene()

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100)
  const lookTarget = new THREE.Vector3(0, params.cameraStartLookY, 0)
  camera.position.set(CAMERA_X, params.cameraStartY, params.cameraDistance)
  camera.lookAt(lookTarget)
  const cameraBase = camera.position.clone()

  scene.add(new THREE.HemisphereLight(0xffffff, 0x7f8698, 1.15))

  const keyLight = new THREE.DirectionalLight(0xffffff, 2.0)
  keyLight.position.set(2.6, 4.2, 3.6)
  scene.add(keyLight)

  const fillLight = new THREE.DirectionalLight(0xdde6ff, 0.85)
  fillLight.position.set(-3.4, 0.4, 1.8)
  scene.add(fillLight)

  const rimLight = new THREE.DirectionalLight(0xffffff, 1.0)
  rimLight.position.set(-1.4, 2.2, -3.6)
  scene.add(rimLight)

  // Everything is drawn into a half-float buffer first, so values past white
  // survive to the bloom pass instead of being clipped by the canvas.
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(1, 1),
    BLOOM_STRENGTH,
    BLOOM_RADIUS,
    BLOOM_THRESHOLD,
  )

  const composer = new EffectComposer(renderer)
  composer.addPass(new RenderPass(scene, camera))
  composer.addPass(bloom)
  composer.addPass(new OutputPass())

  const resize = () => {
    const width = canvas.clientWidth
    const height = canvas.clientHeight
    if (width === 0 || height === 0) return
    renderer.setSize(width, height, false)
    composer.setSize(width, height)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
  }
  resize()
  window.addEventListener('resize', resize)

  let renderFrame: ((dt: number, elapsed: number) => void) | null = null
  const clock = new THREE.Clock()
  /** How hard this frame's jolt is, and how far into the tear it is ringing. */
  let shakeNow = 0
  let shakeAge = 0
  /** A scene time a script asked to hold, or null while the clock runs. */
  let frozenTime: number | null = null

  renderer.setAnimationLoop(() => {
    // A tab that was in the background returns a huge delta; clamp it so the
    // smoothing never jumps.
    const dt = Math.min(clock.getDelta(), 0.05)
    const elapsed = frozenTime ?? clock.elapsedTime
    renderFrame?.(dt, elapsed)
    placeCamera()
    // Kept as a pass rather than rebuilt: switching the bloom off still leaves
    // the frame in the same buffer, so the toggle changes the halo and nothing else.
    bloom.enabled = effects.bloom
    composer.render()
  })

  /**
   * Puts the camera where this frame wants it: the pull's own framing, plus the
   * break's jolt while it rings out. Both read values `setPull` left behind, so
   * the camera is written in one place and never fights itself.
   */
  function placeCamera() {
    if (shakeNow === 0) {
      camera.position.copy(cameraBase)
      camera.lookAt(lookTarget)
      return
    }

    // A vertical hit: the frame is knocked upward, so the paper appears to drop
    // with it. Sideways motion is only a small rattle, and the roll rocks both
    // ways instead of leaving the frame permanently tilted.
    const kick = params.cameraShake * shakeNow
    camera.position.set(
      cameraBase.x + jolt(shakeAge, 61, 0.3) * kick * 0.12,
      cameraBase.y + kick + jolt(shakeAge, 71, 1.9) * kick * 0.3,
      cameraBase.z,
    )
    camera.lookAt(lookTarget)
    camera.rotateZ(params.cameraShakeRoll * shakeNow * jolt(shakeAge, 53, 0.7))
  }

  return {
    scene,
    camera,
    setPull(progress, beat) {
      const t = clamp01(progress / params.maxProgress)
      cameraBase.set(
        CAMERA_X,
        lerp(params.cameraStartY, params.cameraEndY, t),
        params.cameraDistance,
      )
      lookTarget.set(0, lerp(params.cameraStartLookY, params.cameraEndLookY, t), 0)

      // The lab can take the jolt away; the framing and the rush are not its.
      shakeNow = effects.cameraShake ? beat.shake : 0
      shakeAge = beat.age
    },
    freezeTime(at) {
      frozenTime = at
    },
    onFrame(render) {
      renderFrame = render
    },
  }
}

/** A quick, irregular jolt: two sine waves at rates that do not line up. */
function jolt(time: number, rate: number, phase: number): number {
  const wobble = Math.sin(time * rate + phase) + 0.6 * Math.sin(time * rate * 1.87 + phase * 2.1)
  return wobble / 1.6
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t
}
