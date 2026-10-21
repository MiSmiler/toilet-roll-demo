// Boots the dev server, then either replays the drag script below or freezes the
// single frame asked for on the command line. Nothing here ships with the app;
// it exists so a frame can be inspected without a human at the screen.
//
//   node tools/screenshots.mjs                       the four-step drag script
//   node tools/screenshots.mjs --progress 0.081 --viewport 1920x911 --dpr 2 \
//        --crop paper --name join
//
// `--crop paper` asks the page where the paper is and cuts to that box, padded.
// The clip is in CSS pixels; the PNG it writes is that box times `--dpr`.
import { mkdir } from 'node:fs/promises'
import { parseArgs } from 'node:util'
import { chromium } from 'playwright'
import { createServer } from 'vite'

const OUTPUT_DIR = '.scratch/screenshot'

const { values: options } = parseArgs({
  options: {
    viewport: { type: 'string', default: '1280x800' },
    dpr: { type: 'string', default: '1' },
    progress: { type: 'string' },
    hide: { type: 'string' },
    crop: { type: 'string', default: 'full' },
    name: { type: 'string', default: 'frame' },
  },
})

const [width, height] = options.viewport.split('x').map(Number)
const dpr = Number(options.dpr)

await mkdir(OUTPUT_DIR, { recursive: true })

const server = await createServer({ server: { port: 5199, strictPort: true }, logLevel: 'error' })
await server.listen()

const browser = await chromium.launch()
const page = await browser.newPage({
  viewport: { width, height },
  deviceScaleFactor: dpr,
})

try {
  await page.goto(server.resolvedUrls.local[0])
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(700)

  if (options.hide) {
    const parts = options.hide.split(',')
    await page.evaluate((hidden) => {
      window.debug.show(Object.fromEntries(hidden.map((part) => [part, false])))
    }, parts)
  }

  if (options.progress === undefined) {
    await runDragScript()
  } else {
    await page.evaluate((progress) => window.debug.setProgress(progress), Number(options.progress))
    // A settled scene draws the same pixels every time, so one frame is enough.
    await page.waitForTimeout(300)
    console.log(JSON.stringify(await page.evaluate(() => window.debug.read())))
    await capture(options.name)
  }
} finally {
  await browser.close()
  await server.close()
}

/** The shot that shows the pull feeling right: rest, half, full, released. */
async function runDragScript() {
  const start = { x: width / 2, y: Math.round(height * 0.175) }
  // One screen height of travel is a full pull, so half of it is five segments.
  const halfPullY = start.y + height * 0.5
  const fullPullY = start.y + height

  await capture('00-rest')

  // Hold the button down so the frame shows the paper mid-drag, not settled.
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(start.x, halfPullY, { steps: 30 })
  // Steps land on rounded pixels, so finish on the exact point.
  await page.mouse.move(start.x, halfPullY)
  await page.waitForTimeout(500)
  await capture('01-half')

  await page.mouse.move(start.x, fullPullY, { steps: 30 })
  await page.waitForTimeout(250)
  await capture('02-full')

  await page.mouse.up()
  await page.waitForTimeout(800)
  await capture('03-released')
}

async function capture(name) {
  const path = `${OUTPUT_DIR}/${name}.png`
  const clip = options.crop === 'paper' ? await paperClip() : null

  await page.screenshot(clip ? { path, clip } : { path })
  console.log(`wrote ${path}`)
}

/** Padded and clamped, so the paper's own edges stay inside the frame. */
async function paperClip() {
  const rect = await page.evaluate(() => window.debug.paperRect())
  const pad = 8

  const left = Math.max(0, Math.floor(rect.x - pad))
  const top = Math.max(0, Math.floor(rect.y - pad))
  const right = Math.min(width, Math.ceil(rect.x + rect.width + pad))
  const bottom = Math.min(height, Math.ceil(rect.y + rect.height + pad))

  return { x: left, y: top, width: right - left, height: bottom - top }
}
