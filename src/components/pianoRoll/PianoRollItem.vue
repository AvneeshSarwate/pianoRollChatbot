<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import PianoRollRoot from './PianoRollRoot.vue'
import type { NoteDataInput, PianoRollState } from './pianoRollState'
import type { usePlaybackCoordinator } from './playback/usePlaybackCoordinator'

const props = withDefaults(defineProps<{
  id: string
  notes: NoteDataInput[]
  width?: number
  height?: number
  interactive?: boolean
  showControls?: boolean
  includeInQueue?: boolean
  isEditing?: boolean
  coordinator: ReturnType<typeof usePlaybackCoordinator>
}>(), {
  width: 300,
  height: 170,
  interactive: false,
  showControls: true,
  includeInQueue: false,
  isEditing: false
})

const emit = defineEmits<{
  edit: []
  'update:includeInQueue': [value: boolean]
}>()

type PianoRollRootInstance = InstanceType<typeof PianoRollRoot> & {
  setNotes(notes: NoteDataInput[]): void
  setLivePlayheadPosition(position: number): void
  getPlayStartPosition(): number
  fitZoomToNotes(startAtTimeZero?: boolean): void
}

const pianoRollRef = ref<PianoRollRootInstance | null>(null)
const instrumentKind = ref<'poly' | 'fm' | 'am' | 'mono'>('poly')
const loopEnabled = ref(false)
const loopCount = ref(1)
const internalQueueState = ref(props.includeInQueue)

let unregister: (() => void) | null = null

const handleStateSync = (_state: PianoRollState) => {
  // Empty handler for now - could be used for additional state tracking
}

const handlePlayClick = () => {
  props.coordinator.playRoll(props.id)
}

const handleStopClick = () => {
  props.coordinator.stop()
}

const handleEditClick = () => {
  emit('edit')
}

const handleInstrumentChange = () => {
  props.coordinator.setInstrument(props.id, instrumentKind.value)
}

const handleLoopChange = () => {
  props.coordinator.setLoop(props.id, {
    enabled: loopEnabled.value,
    count: loopEnabled.value ? loopCount.value : 1
  })
}

const handleQueueToggle = () => {
  emit('update:includeInQueue', internalQueueState.value)
}

watch(() => props.includeInQueue, (newValue) => {
  internalQueueState.value = newValue
})

watch(() => props.notes, (newVal) => {
  pianoRollRef.value?.setNotes(newVal)
})

watch(loopEnabled, handleLoopChange)
watch(loopCount, handleLoopChange)

onMounted(() => {
  if (!pianoRollRef.value) return

  unregister = props.coordinator.registerRoll({
    id: props.id,
    getNotes: () => [...props.notes],
    getQueueStart: () => pianoRollRef.value?.getPlayStartPosition() ?? 0,
    setLivePlayhead: (position: number) => pianoRollRef.value?.setLivePlayheadPosition(position),
    getGrid: () => ({
      maxLength: 16,
      timeSignature: 4,
      subdivision: 16
    })
  })

  pianoRollRef.value.setNotes(props.notes)
  pianoRollRef.value.fitZoomToNotes(true)
})

onUnmounted(() => {
  unregister?.()
})
</script>

<template>
  <div class="piano-roll-item" :class="{ editing: props.isEditing }">
    <div v-if="showControls" class="controls">
      <span v-if="props.isEditing" class="editing-badge">Editing</span>

      <label class="queue-checkbox">
        <input type="checkbox" v-model="internalQueueState" @change="handleQueueToggle" />
        Queue
      </label>

      <select v-model="instrumentKind" @change="handleInstrumentChange" class="instrument-select">
        <option value="poly">Poly</option>
        <option value="fm">FM</option>
        <option value="am">AM</option>
        <option value="mono">Mono</option>
      </select>

      <label class="loop-toggle">
        <input type="checkbox" v-model="loopEnabled" />
        Loop
      </label>

      <input v-if="loopEnabled" type="number" v-model.number="loopCount" min="1" max="10" class="loop-count" />

      <button @click="handlePlayClick" class="play-btn">▶</button>
      <button @click="handleStopClick" class="stop-btn">■</button>
      <button v-if="!interactive" @click="handleEditClick" :class="['edit-btn', { active: props.isEditing }]">
        {{ props.isEditing ? '⏹ Stop Editing' : '✎ Edit' }}
      </button>
    </div>

    <PianoRollRoot ref="pianoRollRef" :width="width" :height="height" :show-control-panel="false"
      :interactive="interactive" :sync-state="handleStateSync" />
  </div>
</template>

<style scoped>
.piano-roll-item {
  display: inline-flex;
  flex-direction: column;
  gap: 12px;
  background: #ffffff;
  border: 1px solid #d5d9e6;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 4px 12px rgba(12, 14, 32, 0.08);
  transition: border-color 0.2s, box-shadow 0.2s;
  width: fit-content;
}

.piano-roll-item.editing {
  border-color: #22c55e;
  box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.15);
}

.controls {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.queue-checkbox,
.loop-toggle {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: #3a3f55;
  cursor: pointer;
  user-select: none;
}

.queue-checkbox input,
.loop-toggle input {
  cursor: pointer;
}

.instrument-select {
  padding: 4px 8px;
  border: 1px solid #d5d9e6;
  border-radius: 6px;
  font-size: 13px;
  background: #ffffff;
  cursor: pointer;
  transition: border-color 0.2s;
}

.instrument-select:hover {
  border-color: #4a6cf7;
}

.loop-count {
  width: 50px;
  padding: 4px 8px;
  border: 1px solid #d5d9e6;
  border-radius: 6px;
  font-size: 13px;
  text-align: center;
}

.controls button {
  padding: 6px 12px;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.play-btn {
  background: linear-gradient(135deg, #4a6cf7, #667aff);
  color: white;
}

.play-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(74, 108, 247, 0.3);
}

.stop-btn {
  background: linear-gradient(135deg, #ff5b6c, #ff7a85);
  color: white;
}

.stop-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(255, 91, 108, 0.3);
}

.edit-btn {
  background: linear-gradient(135deg, #22c55e, #16a34a);
  color: white;
}

.edit-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(34, 197, 94, 0.3);
}

.edit-btn.active {
  background: linear-gradient(135deg, #16a34a, #15803d);
}

.editing-badge {
  padding: 2px 8px;
  border-radius: 999px;
  background: #dcfce7;
  color: #166534;
  font-size: 12px;
  font-weight: 700;
}
</style>
