import { createStage } from './scene/setup'
import { createToiletRoll } from './scene/toiletRoll'
import { trackPull } from './input/drag'
import { createFeed } from './paper/feed'
import { createLab } from './ui/lab'
import { createProbe } from './debug/probe'
import { createTearTimeline } from './tear/timeline'
import { createWhiteout } from './ui/whiteout'
import { effects, params } from './params'

const canvas = query<HTMLCanvasElement>('#stage')
const stage = createStage(canvas)
const whiteout = createWhiteout(query<HTMLElement>('.whiteout'))

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

  // The tear's ending: the frame takes the rarity's colour, then that bleaches.
  whiteout.set(effects.whiteout ? tear.beat : null, params.rarity)

  lab.showState(probe.read())
})

function query<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector)
  if (!element) throw new Error(`Missing element: ${selector}`)
  return element
}
