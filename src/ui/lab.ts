import type { Probe, SceneState } from '../debug/probe'
import { effects, type DragParams, type Effects } from '../params'
import { RARITIES, type Rarity } from '../scene/rarity'

export type Lab = {
  /** Paints the numbers the last frame was built from. Called every frame. */
  showState(state: SceneState): void
}

type ToggleKnob = {
  label: string
  read: () => boolean
  write: (value: boolean) => void
}

type ChoiceKnob = {
  label: string
  options: { value: Rarity; label: string }[]
  read: () => Rarity
  write: (value: Rarity) => void
}

/**
 * Five blocks, in the order a pull goes through them: which rarity the cut
 * wears, which parts of the prop are drawn, which effects answer the pull, how
 * the drag itself behaves, and what the scene is doing right now.
 *
 * The switches are live, so a run with an effect on and a run with it off can be
 * compared without reloading. The readout exists so a frame can be described
 * well enough for a script to reproduce it.
 */
export function createLab(
  params: DragParams,
  host: HTMLElement,
  onReset: () => void,
  probe: Probe,
): Lab {
  const percent = createReadout('已拉')
  const bar = document.createElement('div')
  bar.className = 'lab__bar'
  const barFill = document.createElement('i')
  bar.append(barFill)
  percent.row.append(bar)

  const strain = createReadout('紧绷')
  const strainBar = document.createElement('div')
  strainBar.className = 'lab__bar'
  const strainFill = document.createElement('i')
  strainBar.append(strainFill)
  strain.row.append(strainBar)

  const torn = createReadout('撕裂')

  const segments = createReadout('段数')
  const length = createReadout('长度')
  const surface = createReadout('窗口')

  const copyLabel = '复制状态'
  const copyButton = createPillButton(copyLabel, () => copyState())

  let current: SceneState | null = null
  let shown = ''

  /**
   * Each switch takes one effect out and leaves the scene whole, so what it was
   * worth is judged by the difference. They run from the light outwards: the two
   * that shape the charge, then what the seam throws, then the paper and the
   * camera.
   */
  const effectToggles: ToggleKnob[] = [
    createEffectToggle('蓄力光晕', 'bloom'),
    createEffectToggle('撕裂爆发', 'burst'),
    createEffectToggle('彩虹光晕', 'prism'),
    createEffectToggle('压暗', 'shadow'),
    createEffectToggle('粒子特效', 'particles'),
    createEffectToggle('纸巾抖动', 'paperTremble'),
    createEffectToggle('镜头震动', 'cameraShake'),
    createEffectToggle('撕裂掉落', 'tearFall'),
    createEffectToggle('纸带摆动', 'paperSway'),
  ]

  /** Rules of the drag rather than of the picture, so they get their own block. */
  const feelToggles: ToggleKnob[] = [
    {
      label: '允许回卷',
      read: () => params.allowRewind,
      write: (allowed) => (params.allowRewind = allowed),
    },
  ]

  const rarityKnob: ChoiceKnob = {
    label: '本次抽到',
    options: RARITIES.map((look) => ({ value: look.id, label: look.label })),
    read: () => params.rarity,
    write: (value) => (params.rarity = value),
  }

  const partToggles: ToggleKnob[] = [
    {
      label: '卷筒',
      read: () => probe.read().parts.roll,
      write: (partShown) => probe.show({ roll: partShown }),
    },
    {
      label: '纸片',
      read: () => probe.read().parts.sheet,
      write: (partShown) => probe.show({ sheet: partShown }),
    },
    {
      label: '撕裂线',
      read: () => probe.read().parts.tearLine,
      write: (partShown) => probe.show({ tearLine: partShown }),
    },
  ]

  const resetButton = createPillButton('重置纸带', onReset)
  resetButton.classList.add('lab__reset')

  host.append(
    resetButton,
    createHead('稀有度'),
    createChoiceRow(rarityKnob),
    createHead('显示'),
    ...partToggles.map(createToggleRow),
    createHead('效果'),
    ...effectToggles.map(createToggleRow),
    createHead('手感'),
    ...feelToggles.map(createToggleRow),
    createHead('状态', copyButton),
    percent.row,
    strain.row,
    torn.row,
    segments.row,
    length.row,
    surface.row,
  )

  async function copyState() {
    if (!current) return

    try {
      await navigator.clipboard.writeText(describeState(current))
      copyButton.textContent = '已复制'
    } catch {
      copyButton.textContent = '复制失败'
    }
    setTimeout(() => (copyButton.textContent = copyLabel), 1200)
  }

  return {
    showState(state) {
      const percentText = `${Math.round(state.progress * 100)}%`
      const strainText = `${Math.round(state.strain * 100)}%`
      const tornText = state.torn ? '是' : '否'
      const segmentsText = `${state.segments} / ${state.maxSegments}`
      const lengthText = state.length.toFixed(2)
      const surfaceText = `${state.viewport.width} × ${state.viewport.height} @ ${state.devicePixelRatio}`
      const summary = [percentText, strainText, tornText, segmentsText, lengthText, surfaceText].join(' ')

      // This runs every frame, and the paper moves in sub-percent steps.
      if (summary === shown) return
      shown = summary
      current = state

      percent.value.textContent = percentText
      barFill.style.width = percentText
      strain.value.textContent = strainText
      strainFill.style.width = strainText
      torn.value.textContent = tornText
      segments.value.textContent = segmentsText
      length.value.textContent = lengthText
      surface.value.textContent = surfaceText
    },
  }
}

/**
 * One line of `key=value` pairs: readable at a glance, and pasted straight into
 * a script that wants to rebuild the same frame.
 */
function describeState(state: SceneState): string {
  const hidden = Object.entries(state.parts).flatMap(([part, shown]) => (shown ? [] : [part]))
  const off = Object.entries(state.effects).flatMap(([effect, shown]) => (shown ? [] : [effect]))

  return [
    `progress=${state.progress.toFixed(3)}`,
    `strain=${state.strain.toFixed(3)}`,
    `torn=${state.torn}`,
    `rarity=${state.rarity}`,
    `segmentLength=${state.segmentLength.toFixed(2)}`,
    `maxSegments=${state.maxSegments}`,
    `length=${state.length.toFixed(2)}`,
    `viewport=${state.viewport.width}x${state.viewport.height}`,
    `dpr=${state.devicePixelRatio}`,
    `hidden=${hidden.length > 0 ? hidden.join(',') : 'none'}`,
    `off=${off.length > 0 ? off.join(',') : 'none'}`,
  ].join(' ')
}

let nextChoiceName = 1

function createHead(title: string, action?: HTMLElement): HTMLElement {
  const head = document.createElement('div')
  head.className = 'lab__head'

  const label = document.createElement('span')
  label.textContent = title

  head.append(label)
  if (action) head.append(action)
  return head
}

function createPillButton(label: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button')
  button.className = 'lab__button'
  button.type = 'button'
  button.textContent = label
  button.addEventListener('click', onClick)
  return button
}

function createReadout(label: string): { row: HTMLElement; value: HTMLElement } {
  const row = document.createElement('div')
  row.className = 'lab__row'

  const name = document.createElement('span')
  name.textContent = label

  const value = document.createElement('output')

  row.append(name, value)
  return { row, value }
}

function createEffectToggle(label: string, effect: keyof Effects): ToggleKnob {
  return {
    label,
    read: () => effects[effect],
    write: (on) => (effects[effect] = on),
  }
}

function createToggleRow(knob: ToggleKnob): HTMLElement {
  const row = document.createElement('label')
  row.className = 'lab__toggle'

  const checkbox = document.createElement('input')
  checkbox.type = 'checkbox'
  checkbox.checked = knob.read()
  checkbox.addEventListener('change', () => knob.write(checkbox.checked))

  const text = document.createElement('span')
  text.textContent = knob.label

  row.append(checkbox, text)
  return row
}

function createChoiceRow(knob: ChoiceKnob): HTMLElement {
  const row = document.createElement('div')
  row.className = 'lab__choice'

  const title = document.createElement('span')
  title.textContent = knob.label

  // Radios sharing a name are one group, so the name has to be unique per row.
  const groupName = `lab-choice-${nextChoiceName++}`
  const group = document.createElement('div')
  group.className = 'lab__choice-group'

  for (const option of knob.options) {
    const label = document.createElement('label')

    const radio = document.createElement('input')
    radio.type = 'radio'
    radio.name = groupName
    radio.value = option.value
    radio.checked = knob.read() === option.value
    radio.addEventListener('change', () => knob.write(option.value))

    const text = document.createElement('span')
    text.textContent = option.label

    label.append(radio, text)
    group.append(label)
  }

  row.append(title, group)
  return row
}
