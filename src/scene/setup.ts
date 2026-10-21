import * as THREE from 'three'
import { params } from '../params'

export type Stage = {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  /** Jolts the camera once, as if the tear struck the frame. */
  shake(): void
  onFrame(render: (dt: number, elapsed: number) => void): void
}

export function createStage(canvas: HTMLCanvasElement): Stage {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05

  const scene = new THREE.Scene()

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100)
  const lookTarget = new THREE.Vector3(0, 0.5, 0)
  camera.position.set(1.05, 1.0, 5.6)
  camera.lookAt(lookTarget)
  const cameraHome = camera.position.clone()

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

  const resize = () => {
    const width = canvas.clientWidth
    const height = canvas.clientHeight
    if (width === 0 || height === 0) return
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
  }
  resize()
  window.addEventListener('resize', resize)

  let renderFrame: ((dt: number, elapsed: number) => void) | null = null
  const clock = new THREE.Clock()
  let shakeStartedAt: number | null = null

  renderer.setAnimationLoop(() => {
    // A tab that was in the background returns a huge delta; clamp it so the
    // smoothing never jumps.
    const dt = Math.min(clock.getDelta(), 0.05)
    renderFrame?.(dt, clock.elapsedTime)
    applyCameraShake(clock.elapsedTime)
    renderer.render(scene, camera)
  })

  /** A short, hard jolt that rings out; the camera is home again when it ends. */
  function applyCameraShake(time: number) {
    if (shakeStartedAt === null) return

    const elapsed = time - shakeStartedAt
    const decay = Math.max(0, 1 - elapsed / params.impactSeconds) ** 2
    if (decay === 0) {
      shakeStartedAt = null
      camera.position.copy(cameraHome)
      camera.lookAt(lookTarget)
      return
    }

    // A vertical hit: the frame is knocked upward, so the paper appears to drop
    // with it. Sideways motion is only a small rattle, and the roll rocks both
    // ways instead of leaving the frame permanently tilted.
    const kick = params.cameraShake * decay
    camera.position.set(
      cameraHome.x + jolt(elapsed, 61, 0.3) * kick * 0.12,
      cameraHome.y + kick + jolt(elapsed, 71, 1.9) * kick * 0.3,
      cameraHome.z,
    )
    camera.lookAt(lookTarget)
    camera.rotateZ(params.cameraShakeRoll * decay * jolt(elapsed, 53, 0.7))
  }

  return {
    scene,
    camera,
    shake() {
      shakeStartedAt = clock.elapsedTime
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
