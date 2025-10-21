<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import * as Tone from 'tone'
import PianoRollRoot from './pianoRoll/PianoRollRoot.vue'
import ClaudeChat from './ClaudeChat.vue'
import TransformWorkbench from './TransformWorkbench.vue'
import { createTransformRegistry } from '../composables/useTransformRegistry'
import { usePlaybackCoordinator } from './pianoRoll/playback/usePlaybackCoordinator'
import type { NoteDataInput, PianoRollState } from './pianoRoll/pianoRollState'
import type { TimelineNote, TimelineState } from '../types/timeline'

const ROLL_ID = 'main-demo'

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
  { id: 'note-12', pitch: 79, position: 6.5, duration: 0.75, velocity: 96 }
]

type PianoRollRootInstance = InstanceType<typeof PianoRollRoot> & {
  setNotes(notes: NoteDataInput[]): void
  setLivePlayheadPosition(position: number): void
  getPlayStartPosition(): number
  fitZoomToNotes(): void
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

const coordinator = usePlaybackCoordinator()

const statusLabel = computed(() => (coordinator.isPlaying.value ? 'Playing' : 'Stopped'))
const hasNotes = computed(() => timelineState.notes.length > 0)
const queueDisplay = computed(() => timelineState.queuePosition.toFixed(2))

let unregister: (() => void) | null = null

const syncQueuePosition = (position: number) => {
  timelineState.queuePosition = position
  if (!coordinator.isPlaying.value) {
    pianoRollRef.value?.setLivePlayheadPosition(position)
  }
}

const handlePlayClick = async () => {
  if (!hasNotes.value) return
  await Tone.start()
  coordinator.playRoll(ROLL_ID)
}

const handleStopClick = () => {
  coordinator.stop()
}

const handleStateSync = (state: PianoRollState) => {
  const notes: TimelineNote[] = Array.from(state.notes.values())
    .map((note) => ({
      id: note.id,
      pitch: note.pitch,
      position: note.position,
      duration: note.duration,
      velocity: note.velocity,
      selected: state.selection.selectedIds.has(note.id)
    }))
    .sort((a, b) => a.position - b.position)

  timelineState.notes = notes
  timelineState.grid.maxLength = state.grid.maxLength
  timelineState.grid.timeSignature = state.grid.timeSignature
  timelineState.grid.subdivision = state.grid.subdivision

  syncQueuePosition(state.queuePlayhead.position)

  coordinator.stop()
}

const getNotes = (): NoteDataInput[] => {
  return timelineState.notes.map(n => ({
    id: n.id,
    pitch: n.pitch,
    position: n.position,
    duration: n.duration,
    velocity: n.velocity ?? 100,
    selected: n.selected
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

const transformRegistry = createTransformRegistry({
  getNotes,
  setNotes: setNotesViaRef,
  getGrid
})

onMounted(() => {
  Tone.Transport.loop = false
  Tone.Transport.bpm.value = 120

  nextTick(() => {
    if (!pianoRollRef.value) return

    unregister = coordinator.registerRoll({
      id: ROLL_ID,
      getNotes,
      getQueueStart: () => pianoRollRef.value?.getPlayStartPosition() ?? 0,
      setLivePlayhead: (position: number) => pianoRollRef.value?.setLivePlayheadPosition(position),
      getGrid
    })

    pianoRollRef.value.setNotes(defaultNotes)
    pianoRollRef.value.fitZoomToNotes()
    syncQueuePosition(pianoRollRef.value.getPlayStartPosition?.() ?? 0)
  })
})

onBeforeUnmount(() => {
  unregister?.()
  coordinator.dispose()
})
</script>

<template>
  <div class="layout">
    <div class="piano-roll-row">
      <section class="piano-roll-card">
        <div class="controls">
          <button @click="handlePlayClick" :disabled="coordinator.isPlaying.value || !hasNotes">Play</button>
          <button @click="handleStopClick" :disabled="!coordinator.isPlaying.value">Stop</button>
          <span class="status" :class="{ playing: coordinator.isPlaying.value }">{{ statusLabel }}</span>
        </div>
        <p class="note">Use the green queue playhead inside the roll to choose a start point, then press play.</p>
        <p class="meta">Queue start (quarter notes): <span>{{ queueDisplay }}</span></p>

        <PianoRollRoot ref="pianoRollRef" :width="600" :height="340" :show-control-panel="true" :interactive="true"
          :sync-state="handleStateSync" />
      </section>
    </div>

    <div class="bottom-row">
      <section class="transform-card">
        <TransformWorkbench :registry="transformRegistry" />
      </section>

      <section class="chatbot-card">
        <ClaudeChat :get-notes="getNotes" :set-notes="setNotesViaRef" :get-grid="getGrid"
          :registry="transformRegistry" />
      </section>
    </div>
  </div>
</template>

<style scoped>
.layout {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.piano-roll-row {
  display: flex;
  justify-content: center;
}

.bottom-row {
  display: flex;
  gap: 24px;
  padding: 0 24px;
}

section {
  background: #ffffff;
  border: 1px solid #d5d9e6;
  border-radius: 16px;
  box-shadow: 0 18px 36px rgba(12, 14, 32, 0.12);
  padding: 20px;
  box-sizing: border-box;
}

.transform-card,
.chatbot-card {
  flex: 1;
  min-width: 0;
}

.piano-roll-card,
.chatbot-card,
.transform-card {
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

@media (max-width: 900px) {
  .bottom-row {
    flex-direction: column;
    padding: 0;
  }
}
</style>
