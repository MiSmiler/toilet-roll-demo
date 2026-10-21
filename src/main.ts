import { createStage } from './scene/setup'
import { createToiletRoll } from './scene/toiletRoll'
import { trackPull } from './input/drag'
import { createFeed } from './paper/feed'
import { createLab } from './ui/lab'
import { createProbe } from './debug/probe'
import { params } from './params'

const canvas = query<HTMLCanvasElement>('#stage')
const stage = createStage(canvas)

const paper = createToiletRoll()
stage.scene.add(paper.object)

const feed = createFeed(params)
const pull = trackPull(canvas, {
  progress: () => feed.progress,
  pixelsPerFullPull: () => canvas.clientHeight * params.dragScreenHeights,
})

const probe = createProbe({ feed, paper, camera: stage.camera, canvas })
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

  // Faster paper swings harder; standing paper is almost still.
  const sway = params.sway * Math.min(1, feed.speed / 3)
  paper.setPaper({ length: feed.length, sway, strain: feed.strain, time })

  lab.showState(probe.read())
})

function query<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector)
  if (!element) throw new Error(`Missing element: ${selector}`)
  return element
}
