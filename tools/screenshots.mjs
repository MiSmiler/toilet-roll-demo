// Boots the dev server, swipes with real pointer events, and writes a few
// frames to .scratch/screenshot/. Nothing here ships with the app; it exists so
// a change to the feel can be checked without a human at the screen first.
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'
import { createServer } from 'vite'

const OUTPUT_DIR = '.scratch/screenshot'
const VIEWPORT = { width: 1280, height: 800 }

// Mirrors GESTURE in src/params.ts: start inside the paper's column, end at 4/5.
const SWIPE_START = { x: 640, y: 250 }
const SWIPE_END = { x: VIEWPORT.width * 0.5, y: VIEWPORT.height * 0.8 }

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

  // Hold the button down so the frame shows the paper mid-swipe, not settled.
  await page.mouse.move(SWIPE_START.x, SWIPE_START.y)
  await page.mouse.down()
  await page.mouse.move(SWIPE_START.x, (SWIPE_START.y + SWIPE_END.y) / 2, { steps: 24 })
  await page.waitForTimeout(150)
  await capture('01-half')

  await page.mouse.move(SWIPE_START.x, SWIPE_END.y + 40, { steps: 24 })
  await page.waitForTimeout(250)
  await capture('02-full')

  await page.mouse.up()
  await page.waitForTimeout(800)
  await capture('03-released')

  await page.getByLabel('显示起点区域').check()
  await page.waitForTimeout(100)
  await capture('04-start-zone')
} finally {
  await browser.close()
  await server.close()
}
