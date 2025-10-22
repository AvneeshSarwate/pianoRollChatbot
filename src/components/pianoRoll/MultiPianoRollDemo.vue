<script setup lang="ts">
import { ref, onMounted, nextTick, onBeforeUnmount, reactive, computed } from 'vue'
import * as Tone from 'tone'
import PianoRollRoot from './PianoRollRoot.vue'
import PianoRollItem from './PianoRollItem.vue'
import { usePlaybackCoordinator } from './playback/usePlaybackCoordinator'
import type { NoteDataInput, PianoRollState } from './pianoRollState'
import ClaudeChat from '../ClaudeChat.vue'
import TransformWorkbench from '../TransformWorkbench.vue'
import { createTransformRegistry } from '../../composables/useTransformRegistry'

type PianoRollRootInstance = InstanceType<typeof PianoRollRoot> & {
  setNotes(notes: NoteDataInput[]): void
  setLivePlayheadPosition(position: number): void
  getPlayStartPosition(): number
  fitZoomToNotes(startAtTimeZero?: boolean): void
}

interface PreviewRoll {
  id: string
  notes: NoteDataInput[]
  includeInQueue: boolean
}

const editorRef = ref<PianoRollRootInstance | null>(null)
const editorNotes = ref<NoteDataInput[]>([
  { id: 'e1', pitch: 60, position: 0, duration: 1, velocity: 100 },
  { id: 'e2', pitch: 64, position: 1, duration: 1, velocity: 100 },
  { id: 'e3', pitch: 67, position: 2, duration: 1, velocity: 100 }
])

const previewRolls = reactive<PreviewRoll[]>([
  {
    id: 'preview-1',
    includeInQueue: true,
    notes: [
      { id: 'p1-1', pitch: 60, position: 0, duration: 1, velocity: 110 },
      { id: 'p1-2', pitch: 64, position: 0, duration: 1, velocity: 105 },
      { id: 'p1-3', pitch: 67, position: 0, duration: 1, velocity: 108 }
    ]
  },
  {
    id: 'preview-2',
    includeInQueue: true,
    notes: [
      { id: 'p2-1', pitch: 62, position: 0, duration: 0.5, velocity: 100 },
      { id: 'p2-2', pitch: 65, position: 0.5, duration: 0.5, velocity: 98 },
      { id: 'p2-3', pitch: 69, position: 1, duration: 1, velocity: 102 }
    ]
  },
  {
    id: 'preview-3',
    includeInQueue: false,
    notes: [
      { id: 'p3-1', pitch: 67, position: 0, duration: 1.5, velocity: 105 },
      { id: 'p3-2', pitch: 72, position: 0, duration: 1.5, velocity: 100 },
      { id: 'p3-3', pitch: 76, position: 0, duration: 1.5, velocity: 103 }
    ]
  },
  {
    id: 'preview-4',
    includeInQueue: false,
    notes: [
      { id: 'p4-1', pitch: 55, position: 0, duration: 2, velocity: 108 },
      { id: 'p4-2', pitch: 59, position: 0, duration: 2, velocity: 105 },
      { id: 'p4-3', pitch: 62, position: 0, duration: 2, velocity: 110 }
    ]
  }
])

const coordinator = usePlaybackCoordinator()
const editingPreviewId = ref<string | null>(null)
const selectedRollId = ref<string>('editor')

let editorUnregister: (() => void) | null = null

// Compute roll options for selectors
const rollOptions = computed(() => [
  { id: 'editor', label: 'Editor' },
  ...previewRolls.map(p => ({ id: p.id, label: p.id }))
])

// Roll accessor functions for multi-roll support
function getNotesForRoll(id: string): NoteDataInput[] {
  if (id === 'editor') return [...editorNotes.value]
  const roll = previewRolls.find(p => p.id === id)
  return roll ? [...roll.notes] : []
}

function setNotesForRoll(id: string, notes: NoteDataInput[]) {
  if (id === 'editor') {
    editorNotes.value = notes.map(n => ({ ...n }))
    editorRef.value?.setNotes(editorNotes.value)
    // If a preview is being edited, sync it too
    if (editingPreviewId.value) {
      const target = previewRolls.find(p => p.id === editingPreviewId.value)
      if (target) target.notes = notes.map(n => ({ ...n }))
    }
    return
  }
  const target = previewRolls.find(p => p.id === id)
  if (target) {
    target.notes = notes.map(n => ({ ...n }))
    // If this preview is being edited, sync editor too
    if (editingPreviewId.value === id) {
      editorNotes.value = notes.map(n => ({ ...n }))
      editorRef.value?.setNotes(editorNotes.value)
    }
  }
}

function getGridForRoll(_id: string) {
  return { maxLength: 16, timeSignature: 4, subdivision: 16 }
}

// Create transform registry
const transformRegistry = createTransformRegistry({
  getNotes: () => getNotesForRoll(selectedRollId.value),
  setNotes: (notes) => setNotesForRoll(selectedRollId.value, notes),
  getGrid: () => getGridForRoll(selectedRollId.value),
  getTargetRollId: () => selectedRollId.value,
  setTargetRollId: (id) => { selectedRollId.value = id }
})

const handleEditorStateSync = (state: PianoRollState) => {
  if (!editingPreviewId.value) return

  const notes: NoteDataInput[] = Array.from(state.notes.values())
    .map((note) => ({
      id: note.id,
      pitch: note.pitch,
      position: note.position,
      duration: note.duration,
      velocity: note.velocity
    }))
    .sort((a, b) => a.position - b.position)

  editorNotes.value = notes

  // Two-way sync: update the preview being edited
  const target = previewRolls.find(p => p.id === editingPreviewId.value)
  if (target) {
    target.notes = notes.map(n => ({ ...n }))
  }

  coordinator.stop()
}

const startEditing = (previewId: string) => {
  coordinator.stop()
  editingPreviewId.value = previewId

  const preview = previewRolls.find(p => p.id === previewId)
  if (!preview) return

  const clonedNotes = preview.notes.map(n => ({ ...n }))
  editorNotes.value = clonedNotes
  editorRef.value?.setNotes(clonedNotes)
  editorRef.value?.fitZoomToNotes(true)
}

const stopEditing = () => {
  coordinator.stop()
  editingPreviewId.value = null
}

const handleEdit = (previewId: string) => {
  if (editingPreviewId.value === previewId) {
    stopEditing()
  } else {
    startEditing(previewId)
  }
}

const handlePlayAll = async () => {
  await Tone.start()

  const queueIds = previewRolls
    .filter(roll => roll.includeInQueue)
    .map(roll => roll.id)

  if (queueIds.length === 0) return

  coordinator.playQueue(queueIds)
}

const handleStopAll = () => {
  coordinator.stop()
}

onMounted(() => {
  Tone.Transport.loop = false
  Tone.Transport.bpm.value = 120

  nextTick(() => {
    if (!editorRef.value) return

    editorUnregister = coordinator.registerRoll({
      id: 'editor',
      getNotes: () => [...editorNotes.value],
      getQueueStart: () => editorRef.value?.getPlayStartPosition() ?? 0,
      setLivePlayhead: (position: number) => editorRef.value?.setLivePlayheadPosition(position),
      getGrid: () => ({
        maxLength: 16,
        timeSignature: 4,
        subdivision: 16
      })
    })

    editorRef.value.setNotes(editorNotes.value)
    editorRef.value.fitZoomToNotes(true)
  })
})

onBeforeUnmount(() => {
  editorUnregister?.()
  coordinator.dispose()
})
</script>

<template>
  <div class="multi-piano-roll-demo">
    <section class="controls-section">
      <div class="editor-controls">
        <button @click="handlePlayAll" class="play-all-btn">▶ Play Queue</button>
        <button @click="handleStopAll" class="stop-all-btn">■ Stop All</button>
      </div>
    </section>

    <section class="previews-section">
      <h2>Previews</h2>
      <div class="preview-grid">
        <PianoRollItem v-for="roll in previewRolls" :key="roll.id" :id="roll.id" :notes="roll.notes" :width="300"
          :height="170" :interactive="false" :coordinator="coordinator" v-model:include-in-queue="roll.includeInQueue"
          :is-editing="editingPreviewId === roll.id" @edit="handleEdit(roll.id)"  />
      </div>
    </section>

    <section class="editor-section" v-show="editingPreviewId">
      <h2>Editor <small v-if="editingPreviewId">— Editing: {{ editingPreviewId }}</small></h2>
      <PianoRollRoot ref="editorRef" :width="600" :height="340" :show-control-panel="true" :interactive="true"
        :sync-state="handleEditorStateSync" />
    </section>

    <section class="tools-section">
      <div class="tools-grid">
        <div class="tool-panel chatbot-panel">
          <ClaudeChat
            :list-rolls="() => rollOptions"
            :get-notes-by-roll="getNotesForRoll"
            :set-notes-by-roll="setNotesForRoll"
            :get-grid-by-roll="getGridForRoll"
            :get-selected-roll-id="() => selectedRollId"
            :registry="transformRegistry"
          />
        </div>
        
        <div class="tool-panel workbench-panel">
          <TransformWorkbench
            :registry="transformRegistry"
            :roll-options="rollOptions"
            v-model:target-roll-id="selectedRollId"
          />
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.multi-piano-roll-demo {
  display: flex;
  flex-direction: column;
  gap: 32px;
  padding: 24px;
}

section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

h2 {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 700;
  color: #1e293b;
}

h2 small {
  font-size: 1rem;
  font-weight: 500;
  color: #64748b;
}

.editor-section {
  background: #ffffff;
  border: 1px solid #d5d9e6;
  border-radius: 16px;
  padding: 24px;
  box-shadow: 0 18px 36px rgba(12, 14, 32, 0.12);
}

.editor-controls {
  display: flex;
  gap: 12px;
}

.editor-controls button {
  padding: 10px 20px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.play-all-btn {
  background: linear-gradient(135deg, #4a6cf7, #667aff);
  color: white;
  box-shadow: 0 8px 18px rgba(74, 108, 247, 0.2);
}

.play-all-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 10px 22px rgba(74, 108, 247, 0.28);
}

.stop-all-btn {
  background: linear-gradient(135deg, #ff5b6c, #ff7a85);
  color: white;
  box-shadow: 0 8px 18px rgba(255, 91, 108, 0.2);
}

.stop-all-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 10px 22px rgba(255, 91, 108, 0.28);
}

.controls-section {
  display: flex;
  justify-content: center;
  padding: 16px;
  background: #ffffff;
  border: 1px solid #d5d9e6;
  border-radius: 16px;
  box-shadow: 0 8px 18px rgba(12, 14, 32, 0.08);
}

.previews-section {
  background: #f8fafc;
  border-radius: 16px;
  padding: 24px;
}

.preview-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
  justify-items: center;
}

/* @media (max-width: 750px) {
  .preview-grid {
    grid-template-columns: 334px;
  }
} */

.tools-section {
  background: #f8fafc;
  border-radius: 16px;
  padding: 24px;
}

.tools-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
}

.tool-panel {
  background: #ffffff;
  border: 1px solid #d5d9e6;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 8px 18px rgba(12, 14, 32, 0.08);
}

@media (max-width: 1400px) {
  .tools-grid {
    grid-template-columns: 1fr;
  }
}
</style>
