import type { TearTimeline } from '../tear/timeline'

export type TearScrubber = {
  /** Whether the act stops itself on the tear so it can be steered. */
  isArmed(): boolean
  /** Arms or disarms the stopper. Disarming lets a parked act run on. */
  setArmed(armed: boolean): void
  /**
   * Decides whether this frame's act may run, and has to be called before the
   * timeline advances: a fresh tear is pinned at its first frame here.
   */
  hold(torn: boolean): void
  /** Paints the head and the readout from the age the act actually reached. */
  show(age: number): void
}

/**
 * The strip that lets the tear's act be steered by hand, for judging timing.
 *
 * It owns no clock of its own: play, pause and every drag position write the same
 * `holdAt` the screenshot script uses, so the frame a person parks on is the frame a
 * script would shoot. The act is only frozen while the strip is armed, and a tear
 * that lands while it is not armed plays exactly as it always did.
 */
export function createTearScrubber(tear: TearTimeline, host: HTMLElement): TearScrubber {
  const bar = document.createElement('div')
  bar.className = 'scrub'
  bar.hidden = true

  const playButton = document.createElement('button')
  playButton.className = 'scrub__button'
  playButton.type = 'button'

  const track = document.createElement('input')
  track.className = 'scrub__track'
  track.type = 'range'
  track.min = '0'
  track.max = tear.duration.toFixed(3)
  track.step = '0.001'
  track.value = '0'

  const age = document.createElement('output')
  age.className = 'scrub__age'

  bar.append(playButton, track, age)
  host.append(bar)

  let armed = false
  /** Whether the act is currently held at a fixed age rather than running. */
  let parked = false
  /** Whether the last frame found the paper torn, for spotting the tear. */
  let wasTorn = false
  /** The head is under the pointer: the drag owns its position, so leave it alone. */
  let scrubbing = false
  /** The age the last drawn frame had, which the controls act on. */
  let reached = 0

  function park(at: number): void {
    tear.holdAt(at)
    parked = true
    reached = at
  }

  function release(): void {
    if (!parked) return
    tear.holdAt(null)
    parked = false
  }

  playButton.addEventListener('click', () => {
    if (parked) {
      release()
    } else if (reached >= tear.duration) {
      // Played out already: start it over rather than press play on a finished act.
      park(0)
      release()
    } else {
      park(reached)
    }
    paint()
  })

  track.addEventListener('pointerdown', () => (scrubbing = true))
  window.addEventListener('pointerup', () => (scrubbing = false))
  track.addEventListener('input', () => {
    park(Number(track.value))
    paint()
  })

  function paint(): void {
    playButton.textContent = parked ? '播放' : '暂停'
    age.textContent = `${Math.round(reached * 1000)} ms`
    if (!scrubbing) track.value = Math.min(reached, tear.duration).toFixed(3)
  }

  paint()

  return {
    isArmed: () => armed,

    setArmed(next) {
      armed = next
      if (armed) return
      release()
      bar.hidden = true
    },

    hold(torn) {
      const started = torn && !wasTorn
      wasTorn = torn

      if (!armed || !torn) {
        release()
        bar.hidden = true
        return
      }

      bar.hidden = false
      // The tear is caught on the frame it happens, so the act is never a few
      // milliseconds in by the time anyone can look at it.
      if (started) park(0)
    },

    show(next) {
      reached = next
      if (!bar.hidden) paint()
    },
  }
}
