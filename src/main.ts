import { createStage } from './scene/setup'
import { createToiletRoll } from './scene/toiletRoll'
import { measureGestureArea } from './input/area'
import { trackSwipe } from './input/swipe'
import { createFeed } from './paper/feed'
import { createOverlay } from './ui/overlay'
import { createLab } from './ui/lab'
import { params } from './params'

const canvas = query<HTMLCanvasElement>('#stage')
const stage = createStage(canvas)

const paper = createToiletRoll()
stage.scene.add(paper.object)

const measure = () =>
  measureGestureArea(stage.camera, canvas.clientWidth, canvas.clientHeight)

const swipe = trackSwipe(canvas, measure)
const feed = createFeed(params)
const overlay = createOverlay(query<HTMLElement>('[data-overlay]'))

const countLabel = query<HTMLElement>('[data-count]')
const meter = query<HTMLElement>('[data-meter]')
const hint = query<HTMLElement>('[data-hint]')

createLab(params, query<HTMLElement>('[data-lab]'), () => {
  swipe.reset()
  feed.reset()
})

let shownCount = ''
let shownPercent = -1

stage.onFrame((dt, time) => {
  feed.update(swipe.target, swipe.isDragging, dt)

  // Faster paper swings harder; standing paper is almost still.
  const sway = params.sway * Math.min(1, feed.speed / 3)
  paper.setPaper({ length: feed.length, sway, time })

  overlay.update(measure())

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

  hint.textContent = swipe.isDragging ? '松手看它落在哪一格' : '从纸边往下滑到圆点'
})

function query<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector)
  if (!element) throw new Error(`Missing element: ${selector}`)
  return element
}
