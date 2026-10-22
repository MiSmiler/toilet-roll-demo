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

  // The tear's light: the frame takes the rarity's colour, then a second wave of
  // white follows it out from the centre. The light reaches the frame's dark corners
  // too, so the vignette steps back as that wave arrives — a white frame ringed by
  // dark edges is still a picture.
  stage.light.update({ cover: tear.beat.cover, white: tear.beat.white, rarity: params.rarity })
  const cornerFade = Math.min(1, Math.max(0, (tear.beat.white - 0.55) / 0.3))
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
