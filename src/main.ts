import { createStage } from './scene/setup'
import { createToiletRoll } from './scene/toiletRoll'
import { trackPull } from './input/drag'
import { createFeed } from './paper/feed'
import { createLab } from './ui/lab'
import { createProbe } from './debug/probe'
import { createTearTimeline } from './tear/timeline'
import { effects, params } from './params'

const canvas = query<HTMLCanvasElement>('#stage')
const stage = createStage(canvas)
const vignette = query<HTMLElement>('.vignette')
let shownVignette = -1

const paper = createToiletRoll()
stage.scene.add(paper.object)

const feed = createFeed(params)
const tear = createTearTimeline()
const pull = trackPull(canvas, {
  progress: () => feed.progress,
  pixelsPerFullPull: () => canvas.clientHeight * params.dragScreenHeights,
})

const probe = createProbe({
  feed,
  paper,
  tear,
  camera: stage.camera,
  canvas,
  freezeTime: stage.freezeTime,
})
window.debug = probe

const lab = createLab(
  params,
  query<HTMLElement>('[data-lab]'),
  () => {
    pull.reset()
    feed.reset()
  },
  probe,
)

stage.onFrame((dt, time) => {
  feed.update(pull.target, pull.isDragging, dt)
  // From the tear onwards everything below reads one clock.
  tear.update(feed.torn, dt)
  stage.setPull(feed.progress, tear.beat)

  // Faster paper swings harder; standing paper is almost still.
  const sway = effects.paperSway ? params.sway * Math.min(1, feed.speed / 3) : 0
  paper.setPaper({
    length: feed.length,
    sway,
    strain: feed.strain,
    torn: feed.torn,
    rarity: params.rarity,
    time,
    dt,
    beat: tear.beat,
  })

  // The tear's light, in the two moments it owns: the rarity's colour leaving the
  // crack, then the halo climbing until the frame is washed out, then the white that
  // closes over it.
  stage.light.update({ light: tear.beat.flood, veil: tear.beat.veil, rarity: params.rarity })
  stage.setGlow(effects.whiteout ? tear.beat.bloom : 0)
  // The vignette lives in the corners, which is where the closing white arrives last,
  // so it only steps back once that fade is nearly upon them.
  const cornerFade = Math.min(1, Math.max(0, (tear.beat.veil - 0.55) / 0.3))
  const vignetteOpacity = effects.whiteout ? 1 - cornerFade : 1
  if (vignetteOpacity !== shownVignette) {
    shownVignette = vignetteOpacity
    vignette.style.opacity = vignetteOpacity.toFixed(3)
  }

  lab.showState(probe.read())
})

function query<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector)
  if (!element) throw new Error(`Missing element: ${selector}`)
  return element
}
