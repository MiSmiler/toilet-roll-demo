import type { Probe, SceneState } from '../debug/probe'
import type { DragParams } from '../params'

export type Lab = {
  /** Paints the numbers the last frame was built from. Called every frame. */
  showState(state: SceneState): void
}

type NumberKnob = {
  label: string
  min: number
  max: number
  step: number
  read: () => number
  write: (value: number) => void
}

type ToggleKnob = {
  label: string
  read: () => boolean
  write: (value: boolean) => void
}

/**
 * Three blocks: what the scene is doing right now, every knob that changes how
 * the pull feels, and which parts of the prop are drawn. The knobs are
 * adjustable live so two versions can be compared without reloading; the
 * readout exists so a scene can be described well enough for a script to
 * reproduce it.
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

  const segments = createReadout('段数')
  const length = createReadout('长度')
  const surface = createReadout('窗口')

  const copyLabel = '复制状态'
  const copyButton = createPillButton(copyLabel, () => copyState())

  host.append(
    createHead('状态', copyButton),
    percent.row,
    segments.row,
    length.row,
    surface.row,
    createHead('手感参数', createPillButton('重置纸带', onReset)),
  )

  let current: SceneState | null = null
  let shown = ''

  const numberKnobs: NumberKnob[] = [
    {
      label: '拉满所需屏数',
      min: 0.4,
      max: 3,
      step: 0.1,
      read: () => params.dragScreenHeights,
      write: (value) => (params.dragScreenHeights = value),
    },
    {
      label: '跟手刚度',
      min: 4,
      max: 80,
      step: 1,
      read: () => params.followStiffness,
      write: (value) => (params.followStiffness = value),
    },
    {
      label: '松手惯性',
      min: 0,
      max: 0.9,
      step: 0.05,
      read: () => params.momentum,
      write: (value) => (params.momentum = value),
    },
    {
      label: '一格长度',
      min: 0.4,
      max: 1.2,
      step: 0.02,
      read: () => params.segmentLength,
      write: (value) => (params.segmentLength = value),
    },
    {
      label: '最多段数',
      min: 1,
      max: 20,
      step: 1,
      read: () => params.maxSegments,
      write: (value) => (params.maxSegments = value),
    },
    {
      label: '摆动幅度',
      min: 0,
      max: 0.08,
      step: 0.002,
      read: () => params.sway,
      write: (value) => (params.sway = value),
    },
  ]

  for (const knob of numberKnobs) host.append(createNumberRow(knob))

  const toggleKnobs: ToggleKnob[] = [
    {
      label: '允许回卷',
      read: () => params.allowRewind,
      write: (value) => (params.allowRewind = value),
    },
  ]

  for (const knob of toggleKnobs) host.append(createToggleRow(knob))

  host.append(createHead('显示'))

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

  for (const knob of partToggles) host.append(createToggleRow(knob))

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
      const segmentsText = `${state.segments} / ${state.maxSegments}`
      const lengthText = state.length.toFixed(2)
      const surfaceText = `${state.viewport.width} × ${state.viewport.height} @ ${state.devicePixelRatio}`
      const summary = [percentText, segmentsText, lengthText, surfaceText].join(' ')

      // This runs every frame, and the paper moves in sub-percent steps.
      if (summary === shown) return
      shown = summary
      current = state

      percent.value.textContent = percentText
      barFill.style.width = percentText
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

  return [
    `progress=${state.progress.toFixed(3)}`,
    `segmentLength=${state.segmentLength.toFixed(2)}`,
    `maxSegments=${state.maxSegments}`,
    `length=${state.length.toFixed(2)}`,
    `viewport=${state.viewport.width}x${state.viewport.height}`,
    `dpr=${state.devicePixelRatio}`,
    `hidden=${hidden.length > 0 ? hidden.join(',') : 'none'}`,
  ].join(' ')
}

let nextControlId = 1

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

function createNumberRow(knob: NumberKnob): HTMLElement {
  const row = document.createElement('div')
  row.className = 'lab__row'

  const controlId = `lab-number-${nextControlId++}`

  const label = document.createElement('label')
  label.htmlFor = controlId
  label.textContent = knob.label

  const value = document.createElement('output')

  const slider = document.createElement('input')
  slider.type = 'range'
  slider.id = controlId
  slider.min = String(knob.min)
  slider.max = String(knob.max)
  slider.step = String(knob.step)
  slider.value = String(knob.read())

  const showCurrent = () => {
    value.textContent = knob.read().toFixed(decimalsOf(knob.step))
  }
  showCurrent()

  slider.addEventListener('input', () => {
    knob.write(Number(slider.value))
    showCurrent()
  })

  row.append(label, value, slider)
  return row
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

function decimalsOf(step: number): number {
  return step < 0.01 ? 3 : step < 1 ? 2 : 0
}
