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

const pull = trackPull(canvas, params.pullAxis)
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
  feed.update(pull, dt)

  // Faster paper swings harder; standing paper is almost still.
  const sway = params.sway * Math.min(1, Math.abs(feed.velocity) / 1.5)
  paper.setPaper({ length: feed.length, sway, time })

  const count = `${feed.segments} / ${params.maxSegments}`
  if (count !== shownCount) {
    countLabel.textContent = count
    shownCount = count
  }

  const maxLength = params.maxSegments * params.segmentLength
  const percent = Math.round(Math.min(1, feed.length / maxLength) * 100)
  if (percent !== shownPercent) {
    meter.style.width = `${percent}%`
    shownPercent = percent
  }

  hint.textContent = pull.isDragging ? '松手，看它怎么停' : '按住画面，向下拖动'
})

function query<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector)
  if (!element) throw new Error(`Missing element: ${selector}`)
  return element
}
