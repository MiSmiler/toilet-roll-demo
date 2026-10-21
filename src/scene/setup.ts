import * as THREE from 'three'

export type Stage = {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  onFrame(render: (dt: number, elapsed: number) => void): void
}

export function createStage(canvas: HTMLCanvasElement): Stage {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05

  const scene = new THREE.Scene()

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100)
  camera.position.set(1.05, 1.0, 5.6)
  camera.lookAt(0, 0.5, 0)

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

  renderer.setAnimationLoop(() => {
    // A tab that was in the background returns a huge delta; clamp it so the
    // smoothing never jumps.
    const dt = Math.min(clock.getDelta(), 0.05)
    renderFrame?.(dt, clock.elapsedTime)
    renderer.render(scene, camera)
  })

  return {
    scene,
    camera,
    onFrame(render) {
      renderFrame = render
    },
  }
}
