// Boots the dev server, drags with real pointer events, and writes a few
// frames to .scratch/screenshot/. Nothing here ships with the app; it exists so
// a change to the feel can be checked without a human at the screen first.
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'
import { createServer } from 'vite'

const OUTPUT_DIR = '.scratch/screenshot'
const VIEWPORT = { width: 1280, height: 800 }

const DRAG_START = { x: 640, y: 140 }
// One screen height of travel is a full pull, so half of it is five segments.
const HALF_PULL_Y = DRAG_START.y + VIEWPORT.height * 0.5
const FULL_PULL_Y = DRAG_START.y + VIEWPORT.height

await mkdir(OUTPUT_DIR, { recursive: true })

const server = await createServer({ server: { port: 5199, strictPort: true }, logLevel: 'error' })
await server.listen()

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: VIEWPORT })

try {
  await page.goto(server.resolvedUrls.local[0])
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(700)

  const capture = async (name) => {
    await page.screenshot({ path: `${OUTPUT_DIR}/${name}.png` })
    console.log(`wrote ${OUTPUT_DIR}/${name}.png`)
  }

  await capture('00-rest')

  // Hold the button down so the frame shows the paper mid-drag, not settled.
  await page.mouse.move(DRAG_START.x, DRAG_START.y)
  await page.mouse.down()
  await page.mouse.move(DRAG_START.x, HALF_PULL_Y, { steps: 30 })
  // Steps land on rounded pixels, so finish on the exact point.
  await page.mouse.move(DRAG_START.x, HALF_PULL_Y)
  await page.waitForTimeout(500)
  await capture('01-half')

  await page.mouse.move(DRAG_START.x, FULL_PULL_Y, { steps: 30 })
  await page.waitForTimeout(250)
  await capture('02-full')

  await page.mouse.up()
  await page.waitForTimeout(800)
  await capture('03-released')
} finally {
  await browser.close()
  await server.close()
}
