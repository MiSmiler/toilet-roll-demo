import type { DragParams } from '../params'

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
 * The feel lab: every knob that changes how the pull feels, adjustable live so
 * two versions can be compared without reloading.
 */
export function createLab(params: DragParams, host: HTMLElement, onReset: () => void): void {
  const head = document.createElement('div')
  head.className = 'lab__head'

  const title = document.createElement('span')
  title.textContent = '手感参数'

  const resetButton = document.createElement('button')
  resetButton.className = 'lab__reset'
  resetButton.type = 'button'
  resetButton.textContent = '重置纸带'
  resetButton.addEventListener('click', onReset)

  head.append(title, resetButton)
  host.append(head)

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
    {
      label: '松手吸附到格位',
      read: () => params.snapOnRelease,
      write: (value) => (params.snapOnRelease = value),
    },
  ]

  for (const knob of toggleKnobs) host.append(createToggleRow(knob))
}

let nextControlId = 1

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
