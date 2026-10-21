import { createStage } from './scene/setup'
import { createToiletRoll } from './scene/toiletRoll'
import { trackPull } from './input/drag'
import { createFeed } from './paper/feed'
import { createLab } from './ui/lab'
import { params } from './params'

const canvas = query<HTMLCanvasElement>('#stage')
const stage = createStage(canvas)

const paper = createToiletRoll()
stage.scene.add(paper.object)

const pull = trackPull(canvas)
const feed = createFeed(params)

const countLabel = query<HTMLElement>('[data-count]')
const meter = query<HTMLElement>('[data-meter]')
const hint = query<HTMLElement>('[data-hint]')

createLab(params, query<HTMLElement>('[data-lab]'), () => {
  pull.reset()
  feed.reset()
})

let shownCount = ''
let shownPercent = -1

stage.onFrame((dt, time) => {
  // A drag of one screen height is a full pull, so the gesture scales with the
  // window instead of with the paper.
  const fullPullPixels = canvas.clientHeight * params.dragScreenHeights
  const target = clamp(pull.pixels / fullPullPixels, 0, 1)

  feed.update(target, pull.isDragging, dt)

  // Faster paper swings harder; standing paper is almost still.
  const sway = params.sway * Math.min(1, feed.speed / 3)
  paper.setPaper({ length: feed.length, sway, time })

  const count = `${feed.segments} / ${params.maxSegments}`
  if (count !== shownCount) {
    countLabel.textContent = count
    shownCount = count
  }

  const percent = Math.round(feed.progress * 100)
  if (percent !== shownPercent) {
    meter.style.width = `${percent}%`
    shownPercent = percent
  }

  hint.textContent = pull.isDragging ? '松手看它落在哪一格' : '按住画面，向下拖动'
})

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function query<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector)
  if (!element) throw new Error(`Missing element: ${selector}`)
  return element
}
