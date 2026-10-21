// Boots the dev server, then either replays the drag script below or freezes the
// frames asked for on the command line. Nothing here ships with the app; it
// exists so a frame can be inspected without a human at the screen.
//
//   node tools/screenshots.mjs                       the four-step drag script
//   node tools/screenshots.mjs --progress 0.081 --viewport 1920x911 --dpr 2 \
//        --crop paper --desc join
//   node tools/screenshots.mjs --progress 0.95 --strain 0,0.4,0.7,0.9,1 \
//        --rarity legendary --time 3 --desc charge
//
// `--progress` freezes one frame; add `--strain` to pin how hard the pull is
// straining past the end, which is what lights the cut up (its default is zero,
// a plain white line). `--rarity` picks which rarity, as the lab's radio
// buttons do. Without `--progress` the frame is held mid-drag instead.
//
// `--strain` and `--rarity` each take a comma list: every combination is shot as
// its own file, in rarity-major order, numbered so a folder sorts into the order
// they were taken. A list also writes a contact sheet of the whole run, which is
// the one picture that shows how the charge builds from start to finish.
//
// `--time` pins the scene clock, so every frame of a list shares one animation
// phase: without it the spikes would be at a different angle in each shot and
// two frames could not be compared.
//
// `--crop paper` asks the page where the paper is and cuts to that box, padded.
// The clip is in CSS pixels; the PNG it writes is that box times `--dpr`.
// Each file is named `<timestamp>_<desc>.png`, the stamp taken per shot, so a
// folder of shots sorts in capture order and a rerun never overwrites the last.
import { mkdir, writeFile } from 'node:fs/promises'
import { parseArgs } from 'node:util'
import { chromium } from 'playwright'
import { createServer } from 'vite'

const OUTPUT_DIR = '.scratch/screenshot'

const { values: options } = parseArgs({
  options: {
    viewport: { type: 'string', default: '1280x800' },
    dpr: { type: 'string', default: '1' },
    progress: { type: 'string' },
    strain: { type: 'string' },
    rarity: { type: 'string' },
    time: { type: 'string' },
    hide: { type: 'string' },
    crop: { type: 'string', default: 'full' },
    desc: { type: 'string', default: 'frame' },
  },
})

const [width, height] = options.viewport.split('x').map(Number)
const dpr = Number(options.dpr)

const strains = listOf(options.strain).map(Number)
const rarities = listOf(options.rarity)
const isList = strains.length > 1 || rarities.length > 1

// A held strain only means something with the paper pulled out to where the cut
// is off the roll; without a progress there is no beam to hold it on. Variants
// need it for the same reason, and because each one has to be a still frame.
if (strains.length > 0 && options.progress === undefined) {
  throw new Error('--strain also needs --progress, e.g. 0.95, so the beam is on screen')
}
if (isList && options.progress === undefined) {
  throw new Error('a list of --strain or --rarity needs --progress, so every frame is a still')
}

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

  if (options.time !== undefined) {
    await page.evaluate((seconds) => window.debug.freezeTime(Number(seconds)), Number(options.time))
  }

  if (options.hide) {
    const parts = options.hide.split(',')
    await page.evaluate((hidden) => {
      window.debug.show(Object.fromEntries(hidden.map((part) => [part, false])))
    }, parts)
  }

  if (options.progress === undefined) {
    await runDragScript()
  } else {
    const shots = []
    const variants = combinations(rarities, strains)

    for (const [index, variant] of variants.entries()) {
      if (variant.rarity !== null) await pickRarity(variant.rarity)
      await page.evaluate((progress) => window.debug.setProgress(progress), Number(options.progress))
      if (variant.strain !== null) {
        await page.evaluate((strain) => window.debug.holdStrain(strain), variant.strain)
      }

      // Long enough for the cut's own opening transition to finish, so a frozen
      // clock does not leave it half drawn.
      await page.waitForTimeout(700)

      const label = [variant.rarity, variant.strain === null ? null : `strain ${variant.strain}`]
        .filter((part) => part !== null)
        .join(' · ')
      const name = isList
        ? `${options.desc}-${String(index + 1).padStart(2, '0')}_${variantSuffix(variant)}`
        : options.desc
      shots.push(await capture(name, label))
    }

    if (isList) await writeSheet(shots)
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

  await capture('rest')

  // Hold the button down so the frame shows the paper mid-drag, not settled.
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(start.x, halfPullY, { steps: 30 })
  // Steps land on rounded pixels, so finish on the exact point.
  await page.mouse.move(start.x, halfPullY)
  await page.waitForTimeout(500)
  await capture('half')

  await page.mouse.move(start.x, fullPullY, { steps: 30 })
  await page.waitForTimeout(250)
  await capture('full')

  await page.mouse.up()
  await page.waitForTimeout(800)
  await capture('released')
}

/** Rarity is chosen the way a human chooses it: by clicking the lab's radio. */
async function pickRarity(rarity) {
  await page.click(`input[name^="lab-choice"][value="${rarity}"]`)
  await page.waitForTimeout(100)
}

/** One file per shot; the buffer comes back so a list can also be laid out whole. */
async function capture(name, label = '') {
  const path = `${OUTPUT_DIR}/${timestamp()}_${name}.png`
  const clip = options.crop === 'paper' ? await paperClip() : null
  const buffer = clip ? await page.screenshot({ clip }) : await page.screenshot()

  await writeFile(path, buffer)
  console.log(`wrote ${path}${label ? `  (${label})` : ''}`)

  return { buffer, label }
}

/**
 * The whole run as one picture: a grid of the frames in the order they were
 * taken, which is how a charge is judged as a progression rather than as a set
 * of stills. Built in a throwaway page so nothing ships with the app.
 */
async function writeSheet(shots) {
  const columns = Math.min(4, shots.length)
  const cells = shots
    .map(
      (shot) =>
        `<figure><img src="data:image/png;base64,${shot.buffer.toString('base64')}">` +
        `<figcaption>${shot.label}</figcaption></figure>`,
    )
    .join('')

  const html = `<!doctype html><style>
    body { margin: 0; padding: 14px; background: #0a0b0f; color: #f4f1e9;
           font: 12px/1.4 ui-sans-serif, system-ui, sans-serif; }
    .grid { display: grid; grid-template-columns: repeat(${columns}, 1fr); gap: 10px; }
    figure { margin: 0; }
    img { display: block; width: 100%; border: 1px solid rgba(244, 241, 233, 0.14); border-radius: 6px; }
    figcaption { padding-top: 4px; color: rgba(244, 241, 233, 0.7); font-variant-numeric: tabular-nums; }
  </style><div class="grid">${cells}</div>`

  const path = `${OUTPUT_DIR}/${timestamp()}_${options.desc}-sheet.png`
  const sheet = await browser.newPage({ viewport: { width, height } })

  try {
    await sheet.setContent(html)
    await sheet.screenshot({ path, fullPage: true })
  } finally {
    await sheet.close()
  }

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

/** Every rarity with every strain, rarity on the outside so each row is one look. */
function combinations(rarities, strains) {
  const rarityOptions = rarities.length > 0 ? rarities : [null]
  const strainOptions = strains.length > 0 ? strains : [null]
  const variants = []

  for (const rarity of rarityOptions) {
    for (const strain of strainOptions) variants.push({ rarity, strain })
  }

  return variants
}

function variantSuffix({ rarity, strain }) {
  const parts = []
  if (rarity !== null) parts.push(rarity)
  if (strain !== null) parts.push(`s${strain}`)
  return parts.join('-')
}

function listOf(value) {
  return value === undefined ? [] : value.split(',').map((entry) => entry.trim()).filter(Boolean)
}

/** Second granularity, no colons: a name a filesystem takes and a sort reads. */
function timestamp() {
  const now = new Date()
  const pad = (value) => String(value).padStart(2, '0')
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  return `${date}-${time}`
}
