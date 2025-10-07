<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import * as Tone from 'tone'
import PianoRollRoot from './pianoRoll/PianoRollRoot.vue'
import TimelinePreview from './TimelinePreview.vue'
import ClaudeChat from './ClaudeChat.vue'
import type { NoteDataInput, PianoRollState } from './pianoRoll/pianoRollState'
import type { TimelineNote, TimelineState } from '../types/timeline'

const START_DELAY = 0.05

const defaultNotes: NoteDataInput[] = [
  { id: 'note-1', pitch: 60, position: 0, duration: 1, velocity: 110 },
  { id: 'note-2', pitch: 64, position: 0, duration: 1, velocity: 105 },
  { id: 'note-3', pitch: 67, position: 0, duration: 1, velocity: 108 },
  { id: 'note-4', pitch: 72, position: 0, duration: 1, velocity: 102 },
  { id: 'note-5', pitch: 60, position: 2, duration: 1.5, velocity: 110 },
  { id: 'note-6', pitch: 67, position: 2, duration: 1.5, velocity: 108 },
  { id: 'note-7', pitch: 74, position: 2, duration: 1.5, velocity: 104 },
  { id: 'note-8', pitch: 62, position: 4, duration: 0.5, velocity: 99 },
  { id: 'note-9', pitch: 65, position: 4.5, duration: 0.5, velocity: 98 },
  { id: 'note-10', pitch: 69, position: 5, duration: 1, velocity: 101 },
  { id: 'note-11', pitch: 72, position: 6, duration: 1, velocity: 102 },
  { id: 'note-12', pitch: 76, position: 6.5, duration: 0.75, velocity: 96 }
]

type PianoRollRootInstance = InstanceType<typeof PianoRollRoot> & {
  setNotes(notes: NoteDataInput[]): void
  setLivePlayheadPosition(position: number): void
  getPlayStartPosition(): number
  fitZoomToNotes(): void
}

interface ScheduledEvent {
  note: TimelineNote
  duration: number
  velocity: number
}

interface TimedScheduledEvent extends ScheduledEvent {
  time: number
}

const pianoRollRef = ref<PianoRollRootInstance | null>(null)

const timelineState = reactive<TimelineState>({
  notes: [],
  playheadPosition: 0,
  queuePosition: 0,
  grid: {
    maxLength: 16,
    timeSignature: 4,
    subdivision: 16
  }
})

const isPlaying = ref(false)
const statusLabel = computed(() => (isPlaying.value ? 'Playing' : 'Stopped'))
const hasNotes = computed(() => timelineState.notes.length > 0)
const queueDisplay = computed(() => timelineState.queuePosition.toFixed(2))

let synth: Tone.PolySynth<Tone.Synth> | null = null
let part: Tone.Part<TimedScheduledEvent> | null = null
let rafId: number | null = null
let stopScheduleId: number | null = null
let playbackStartPosition = 0

const quarterNoteSeconds = () => 60 / Tone.Transport.bpm.value
const quartersPerSecond = () => Tone.Transport.bpm.value / 60

const clearAnimation = () => {
  if (rafId !== null) {
    cancelAnimationFrame(rafId)
    rafId = null
  }
}

const setLivePlayhead = (position: number) => {
  timelineState.playheadPosition = position
  pianoRollRef.value?.setLivePlayheadPosition(position)
}

const syncQueuePosition = (position: number) => {
  timelineState.queuePosition = position
  if (!isPlaying.value) {
    setLivePlayhead(position)
  }
}

const clearTransportSchedules = () => {
  if (stopScheduleId !== null) {
    Tone.Transport.clear(stopScheduleId)
    stopScheduleId = null
  }
  Tone.Transport.cancel()
}

const stopPlayback = (resetToQueue = true) => {
  if (!isPlaying.value && !part) {
    return
  }

  Tone.Transport.stop()
  clearTransportSchedules()

  if (part) {
    part.stop(0)
    part.dispose()
    part = null
  }

  clearAnimation()
  isPlaying.value = false

  if (resetToQueue) {
    const target = pianoRollRef.value?.getPlayStartPosition?.() ?? timelineState.queuePosition ?? 0
    setLivePlayhead(target)
  }
}

const scheduleAnimation = () => {
  clearAnimation()
  const update = () => {
    if (!isPlaying.value) return
    const elapsedSeconds = Tone.Transport.seconds
    const currentQuarter = playbackStartPosition + elapsedSeconds * quartersPerSecond()
    setLivePlayhead(currentQuarter)
    rafId = requestAnimationFrame(update)
  }
  rafId = requestAnimationFrame(update)
}

const startPlayback = async () => {
  if (!hasNotes.value) return

  synth ??= new Tone.PolySynth(Tone.Synth).toDestination()

  await Tone.start()

  if (isPlaying.value) {
    stopPlayback(false)
  }

  playbackStartPosition = pianoRollRef.value?.getPlayStartPosition?.() ?? timelineState.queuePosition
  const activeNotes = timelineState.notes
    .filter((note) => note.position + note.duration > playbackStartPosition)
    .map((note) => ({
      note,
      offset: Math.max(0, note.position - playbackStartPosition)
    }))

  if (!activeNotes.length) {
    setLivePlayhead(playbackStartPosition)
    return
  }

  const quarterSeconds = quarterNoteSeconds()
  const scheduledEvents = activeNotes.map<TimedScheduledEvent>((entry) => {
    const velocity = Math.max(0, Math.min(1, (entry.note.velocity ?? 100) / 127))
    return {
      note: entry.note,
      time: entry.offset * quarterSeconds,
      velocity,
      duration: Math.max(entry.note.duration, 0.0625) * quarterSeconds
    }
  })

  if (part) {
    part.stop(0)
    part.dispose()
    part = null
  }

  clearTransportSchedules()

  part = new Tone.Part<TimedScheduledEvent>((time, event) => {
    const noteName = Tone.Frequency(event.note.pitch, 'midi').toNote()
    synth?.triggerAttackRelease(noteName, event.duration, time, event.velocity)
  }, scheduledEvents)

  part.start(0)

  Tone.Transport.stop()
  Tone.Transport.position = 0
  Tone.Transport.start(`+${START_DELAY.toFixed(3)}`)

  isPlaying.value = true
  setLivePlayhead(playbackStartPosition)

  const playbackDuration = scheduledEvents.reduce((end, event) => Math.max(end, event.time + event.duration), 0)

  stopScheduleId = Tone.Transport.scheduleOnce(() => {
    stopPlayback()
  }, playbackDuration + 0.1)

  scheduleAnimation()
}

const handlePlayClick = () => {
  startPlayback().catch((error) => console.error(error))
}

const handleStopClick = () => {
  stopPlayback()
}

const handleStateSync = (state: PianoRollState) => {
  const notes: TimelineNote[] = Array.from(state.notes.values())
    .map((note) => ({
      id: note.id,
      pitch: note.pitch,
      position: note.position,
      duration: note.duration,
      velocity: note.velocity
    }))
    .sort((a, b) => a.position - b.position)

  timelineState.notes = notes
  timelineState.grid.maxLength = state.grid.maxLength
  timelineState.grid.timeSignature = state.grid.timeSignature
  timelineState.grid.subdivision = state.grid.subdivision

  syncQueuePosition(state.queuePlayhead.position)

  stopPlayback()
}

const getNotes = (): NoteDataInput[] => {
  return timelineState.notes.map(n => ({
    id: n.id,
    pitch: n.pitch,
    position: n.position,
    duration: n.duration,
    velocity: n.velocity ?? 100
  }))
}

const setNotesViaRef = (notes: NoteDataInput[]) => {
  pianoRollRef.value?.setNotes(notes)
}

const getGrid = () => ({
  maxLength: timelineState.grid.maxLength,
  timeSignature: timelineState.grid.timeSignature,
  subdivision: timelineState.grid.subdivision
})

onMounted(() => {
  Tone.Transport.loop = false
  Tone.Transport.bpm.value = 120

  nextTick(() => {
    if (!pianoRollRef.value) return
    pianoRollRef.value.setNotes(defaultNotes)
    pianoRollRef.value.fitZoomToNotes()
    syncQueuePosition(pianoRollRef.value.getPlayStartPosition?.() ?? 0)
  })
})

onBeforeUnmount(() => {
  stopPlayback(false)
  clearTransportSchedules()
  synth?.dispose()
  synth = null
})
</script>

<template>
  <div class="layout">
    <section class="piano-roll-card">
      <div class="controls">
        <button @click="handlePlayClick" :disabled="isPlaying || !hasNotes">Play</button>
        <button @click="handleStopClick" :disabled="!isPlaying">Stop</button>
        <span class="status" :class="{ playing: isPlaying }">{{ statusLabel }}</span>
      </div>
      <p class="note">Use the green queue playhead inside the roll to choose a start point, then press play.</p>
      <p class="meta">Queue start (quarter notes): <span>{{ queueDisplay }}</span></p>

      <PianoRollRoot
        ref="pianoRollRef"
        :width="900"
        :height="340"
        :show-control-panel="true"
        :interactive="true"
        :sync-state="handleStateSync"
      />
    </section>

    <section class="visualizer-card">
      <h2 class="visualizer-title">p5.js Timeline Preview</h2>
      <p class="note">Incoming notes and playhead data are mirrored here for custom visualizations.</p>
      <TimelinePreview :state="timelineState" />
    </section>

    <section class="chatbot-card">
      <ClaudeChat 
        :get-notes="getNotes" 
        :set-notes="setNotesViaRef" 
        :get-grid="getGrid" 
      />
    </section>
  </div>
</template>

<style scoped>
.layout {
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
}

section {
  background: #ffffff;
  border: 1px solid #d5d9e6;
  border-radius: 16px;
  box-shadow: 0 18px 36px rgba(12, 14, 32, 0.12);
  padding: 20px;
  flex: 1 1 480px;
  box-sizing: border-box;
}

.piano-roll-card,
.visualizer-card,
.chatbot-card {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.controls {
  display: flex;
  gap: 12px;
  align-items: center;
}

.controls button {
  background: linear-gradient(135deg, #4a6cf7, #667aff);
  border: none;
  border-radius: 8px;
  color: #ffffff;
  padding: 8px 18px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease, opacity 0.2s ease;
  box-shadow: 0 8px 18px rgba(74, 108, 247, 0.2);
}

.controls button:nth-of-type(2) {
  background: linear-gradient(135deg, #ff5b6c, #ff7a85);
  box-shadow: 0 8px 18px rgba(255, 91, 108, 0.2);
}

.controls button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  box-shadow: none;
}

.controls button:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 10px 22px rgba(74, 108, 247, 0.28);
}

.status {
  font-weight: 600;
  color: #3a3f55;
}

.status.playing {
  color: #2f7f48;
}

.note {
  margin: 0;
  color: #4d5268;
  font-size: 0.95rem;
}

.meta {
  margin: 0;
  color: #2f7f48;
  font-weight: 600;
}

.meta span {
  font-variant-numeric: tabular-nums;
}

.visualizer-title {
  margin: 0;
  font-size: 1.2rem;
  font-weight: 600;
  color: #303553;
}

@media (max-width: 900px) {
  .layout {
    flex-direction: column;
  }

  section {
    flex: 1 1 auto;
  }
}
</style>
