import { ref, computed } from 'vue'
import * as Tone from 'tone'
import type { NoteDataInput } from '../pianoRollState'

const START_DELAY = 0.05

interface RollRegistration {
  id: string
  getNotes: () => NoteDataInput[]
  getQueueStart: () => number
  setLivePlayhead: (position: number) => void
  getGrid: () => { maxLength: number; timeSignature: number; subdivision: number }
}

interface LoopConfig {
  enabled: boolean
  count?: number
}

type InstrumentKind = 'poly' | 'fm' | 'am' | 'mono'

interface QueueItem {
  rollId: string
  index: number
  total: number
}

type ToneInstrument = Tone.PolySynth<Tone.Synth> | Tone.FMSynth | Tone.AMSynth | Tone.MonoSynth

export function usePlaybackCoordinator() {
  const rolls = new Map<string, RollRegistration>()
  const instruments = new Map<string, ToneInstrument>()
  const loopConfigs = new Map<string, LoopConfig>()

  const isPlaying = ref(false)
  const currentRollId = ref<string | null>(null)
  const queueState = ref<QueueItem | null>(null)

  let currentParts: Map<string, Tone.Part> = new Map()
  let rafIds: Map<string, number> = new Map()
  let stopScheduleId: number | null = null
  let playbackStartPositions: Map<string, number> = new Map()
  let currentQueueIds: string[] = []
  let isQueueMode = false

  const quarterNoteSeconds = () => 60 / Tone.Transport.bpm.value
  const quartersPerSecond = () => Tone.Transport.bpm.value / 60

  const clearAnimation = (rollId?: string) => {
    if (rollId) {
      const id = rafIds.get(rollId)
      if (id !== undefined) {
        cancelAnimationFrame(id)
        rafIds.delete(rollId)
      }
    } else {
      rafIds.forEach(id => cancelAnimationFrame(id))
      rafIds.clear()
    }
  }

  const clearTransportSchedules = () => {
    if (stopScheduleId !== null) {
      Tone.Transport.clear(stopScheduleId)
      stopScheduleId = null
    }
    Tone.Transport.cancel()
  }

  const disposeInstrument = (id: string) => {
    const instrument = instruments.get(id)
    if (instrument) {
      instrument.dispose()
      instruments.delete(id)
    }
  }

  const createInstrument = (kind: InstrumentKind): ToneInstrument => {
    switch (kind) {
      case 'poly':
        return new Tone.PolySynth(Tone.Synth).toDestination()
      case 'fm':
        return new Tone.FMSynth().toDestination()
      case 'am':
        return new Tone.AMSynth().toDestination()
      case 'mono':
        return new Tone.MonoSynth().toDestination()
      default:
        return new Tone.PolySynth(Tone.Synth).toDestination()
    }
  }

  const registerRoll = (roll: RollRegistration) => {
    rolls.set(roll.id, roll)
    instruments.set(roll.id, createInstrument('poly'))
    loopConfigs.set(roll.id, { enabled: false, count: 1 })

    return () => {
      rolls.delete(roll.id)
      disposeInstrument(roll.id)
      loopConfigs.delete(roll.id)
    }
  }

  const setInstrument = (id: string, kind: InstrumentKind) => {
    disposeInstrument(id)
    instruments.set(id, createInstrument(kind))
  }

  const setLoop = (id: string, config: LoopConfig) => {
    loopConfigs.set(id, config)
  }

  const scheduleAnimation = (rollId: string) => {
    const roll = rolls.get(rollId)
    if (!roll) return

    const startPosition = playbackStartPositions.get(rollId) || 0

    const update = () => {
      if (!isPlaying.value || (!isQueueMode && currentRollId.value !== rollId)) return
      if (isQueueMode && !currentQueueIds.includes(rollId)) return
      
      const elapsedSeconds = Tone.Transport.seconds
      const currentQuarter = startPosition + elapsedSeconds * quartersPerSecond()
      roll.setLivePlayhead(currentQuarter)
      const id = requestAnimationFrame(update)
      rafIds.set(rollId, id)
    }
    const id = requestAnimationFrame(update)
    rafIds.set(rollId, id)
  }

  const playRollInternal = async (rollId: string): Promise<void> => {
    const roll = rolls.get(rollId)
    const instrument = instruments.get(rollId)
    const loopConfig = loopConfigs.get(rollId)

    if (!roll || !instrument) return

    await Tone.start()

    const playbackStartPosition = roll.getQueueStart()
    playbackStartPositions.set(rollId, playbackStartPosition)
    
    const notes = roll.getNotes()
    const activeNotes = notes
      .filter((note) => note.position + note.duration > playbackStartPosition)
      .map((note) => ({
        note,
        offset: Math.max(0, note.position - playbackStartPosition)
      }))

    if (!activeNotes.length) {
      roll.setLivePlayhead(playbackStartPosition)
      return
    }

    const maxEndQ = Math.max(...activeNotes.map(n => n.note.position + n.note.duration))
    const startQ = playbackStartPosition
    const loopLength = Math.max(1, Math.ceil(maxEndQ - startQ))

    const quarterSeconds = quarterNoteSeconds()
    const scheduledEvents = activeNotes.map((entry) => {
      const velocity = Math.max(0, Math.min(1, (entry.note.velocity ?? 100) / 127))
      return {
        pitch: entry.note.pitch,
        time: entry.offset * quarterSeconds,
        velocity,
        duration: Math.max(entry.note.duration, 0.0625) * quarterSeconds
      }
    })

    const existingPart = currentParts.get(rollId)
    if (existingPart) {
      existingPart.stop(0)
      existingPart.dispose()
    }

    clearTransportSchedules()

    const part = new Tone.Part((time, event) => {
      const noteName = Tone.Frequency(event.pitch, 'midi').toNote()
      instrument.triggerAttackRelease(noteName, event.duration, time, event.velocity)
    }, scheduledEvents)

    currentParts.set(rollId, part)
    part.start(0)

    let effectiveLoopCount = 1
    if (loopConfig?.enabled) {
      if (isQueueMode) {
        effectiveLoopCount = Math.min(loopConfig.count || 1, 10)
      } else {
        effectiveLoopCount = loopConfig.count === Infinity ? Infinity : (loopConfig.count || 1)
      }
      if (effectiveLoopCount > 1 || effectiveLoopCount === Infinity) {
        part.loop = true
        part.loopEnd = loopLength * quarterSeconds
      }
    }

    Tone.Transport.stop()
    Tone.Transport.position = 0
    Tone.Transport.start(`+${START_DELAY.toFixed(3)}`)

    currentRollId.value = rollId
    isPlaying.value = true
    roll.setLivePlayhead(playbackStartPosition)

    const playbackDuration = scheduledEvents.reduce((end, event) => Math.max(end, event.time + event.duration), 0)
    const totalDuration = effectiveLoopCount === Infinity
      ? Number.MAX_SAFE_INTEGER
      : playbackDuration * effectiveLoopCount

    scheduleAnimation(rollId)

    return new Promise((resolve) => {
      if (effectiveLoopCount === Infinity) {
        resolve()
        return
      }

      stopScheduleId = Tone.Transport.scheduleOnce(() => {
        if (currentRollId.value === rollId) {
          stopInternal(true)
        }
        resolve()
      }, totalDuration + 0.1)
    })
  }

  const stopInternal = (resetToQueue = true) => {
    if (!isPlaying.value && currentParts.size === 0) {
      return
    }

    Tone.Transport.stop()
    clearTransportSchedules()

    currentParts.forEach((part) => {
      part.stop(0)
      part.dispose()
    })
    currentParts.clear()

    clearAnimation()

    const rollId = currentRollId.value
    currentRollId.value = null
    isPlaying.value = false

    if (resetToQueue) {
      if (isQueueMode) {
        currentQueueIds.forEach(id => {
          const roll = rolls.get(id)
          if (roll) {
            const target = roll.getQueueStart()
            roll.setLivePlayhead(target)
          }
        })
      } else if (rollId) {
        const roll = rolls.get(rollId)
        if (roll) {
          const target = roll.getQueueStart()
          roll.setLivePlayhead(target)
        }
      }
    }

    playbackStartPositions.clear()
    queueState.value = null
  }

  const playRoll = async (id: string) => {
    if (isPlaying.value) {
      stopInternal(false)
    }
    isQueueMode = false
    currentQueueIds = []
    await playRollInternal(id)
  }

  const playQueue = async (ids: string[]) => {
    if (isPlaying.value) {
      stopInternal(false)
    }

    isQueueMode = true
    currentQueueIds = ids.filter(id => rolls.has(id))

    if (currentQueueIds.length === 0) return

    await Tone.start()

    const quarterSeconds = quarterNoteSeconds()
    let maxTotalDuration = 0

    for (const rollId of currentQueueIds) {
      const roll = rolls.get(rollId)
      const instrument = instruments.get(rollId)
      const loopConfig = loopConfigs.get(rollId)

      if (!roll || !instrument) continue

      const playbackStartPosition = roll.getQueueStart()
      playbackStartPositions.set(rollId, playbackStartPosition)

      const notes = roll.getNotes()
      const activeNotes = notes
        .filter((note) => note.position + note.duration > playbackStartPosition)
        .map((note) => ({
          note,
          offset: Math.max(0, note.position - playbackStartPosition)
        }))

      if (!activeNotes.length) {
        roll.setLivePlayhead(playbackStartPosition)
        continue
      }

      const maxEndQ = Math.max(...activeNotes.map(n => n.note.position + n.note.duration))
      const startQ = playbackStartPosition
      const loopLength = Math.max(1, Math.ceil(maxEndQ - startQ))

      const scheduledEvents = activeNotes.map((entry) => {
        const velocity = Math.max(0, Math.min(1, (entry.note.velocity ?? 100) / 127))
        return {
          pitch: entry.note.pitch,
          time: entry.offset * quarterSeconds,
          velocity,
          duration: Math.max(entry.note.duration, 0.0625) * quarterSeconds
        }
      })

      const part = new Tone.Part((time, event) => {
        const noteName = Tone.Frequency(event.pitch, 'midi').toNote()
        instrument.triggerAttackRelease(noteName, event.duration, time, event.velocity)
      }, scheduledEvents)

      currentParts.set(rollId, part)
      part.start(0)

      let effectiveLoopCount = 1
      if (loopConfig?.enabled) {
        effectiveLoopCount = Math.min(loopConfig.count || 1, 10)
        if (effectiveLoopCount > 1) {
          part.loop = true
          part.loopEnd = loopLength * quarterSeconds
        }
      }

      roll.setLivePlayhead(playbackStartPosition)

      const playbackDuration = scheduledEvents.reduce((end, event) => Math.max(end, event.time + event.duration), 0)
      const totalDuration = playbackDuration * effectiveLoopCount
      maxTotalDuration = Math.max(maxTotalDuration, totalDuration)

      scheduleAnimation(rollId)
    }

    Tone.Transport.stop()
    Tone.Transport.position = 0
    Tone.Transport.start(`+${START_DELAY.toFixed(3)}`)

    isPlaying.value = true
    queueState.value = {
      rollId: currentQueueIds.join(','),
      index: currentQueueIds.length,
      total: currentQueueIds.length
    }

    stopScheduleId = Tone.Transport.scheduleOnce(() => {
      stopInternal(true)
    }, maxTotalDuration + 0.1)
  }

  const stop = () => {
    isQueueMode = false
    currentQueueIds = []
    stopInternal(true)
  }

  const dispose = () => {
    stop()
    instruments.forEach((instrument, _key) => instrument.dispose())
    instruments.clear()
    rolls.clear()
    loopConfigs.clear()
  }

  return {
    registerRoll,
    setInstrument,
    setLoop,
    playRoll,
    playQueue,
    stop,
    dispose,
    isPlaying: computed(() => isPlaying.value),
    currentRollId: computed(() => currentRollId.value),
    queueState: computed(() => queueState)
  }
}
