// Boots the dev server, pulls the paper with real pointer events, and writes a
// few frames to .scratch/. Nothing here ships with the app; it exists so a
// change to the feel can be checked without a human at the screen first.
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'
import { createServer } from 'vite'

const OUTPUT_DIR = '.scratch/screenshot'
const VIEWPORT = { width: 1280, height: 800 }
const PULL_START = { x: 640, y: 380 }

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

  // Hold the button down so the frame shows the paper mid-pull, not settled.
  await page.mouse.move(PULL_START.x, PULL_START.y)
  await page.mouse.down()
  await page.mouse.move(PULL_START.x, PULL_START.y + 260, { steps: 30 })
  await page.waitForTimeout(150)
  await capture('01-pulling')

  await page.mouse.move(PULL_START.x, PULL_START.y + 1000, { steps: 40 })
  await page.waitForTimeout(250)
  await capture('02-full')

  await page.mouse.up()
  await page.waitForTimeout(700)
  await capture('03-released')
} finally {
  await browser.close()
  await server.close()
}
