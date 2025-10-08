<script setup lang="ts">
import { ref, computed } from 'vue'
import { Codemirror } from 'vue-codemirror'
import { javascript } from '@codemirror/lang-javascript'
import { oneDark } from '@codemirror/theme-one-dark'
import type { TransformRegistry } from '../composables/useTransformRegistry'

interface Props {
  registry: TransformRegistry
}

const props = defineProps<Props>()

const activeTab = ref(0)
const paramInputs = ref<Record<number, Record<string, number>>>({})
const extensions = [javascript(), oneDark]

const activeSlot = computed(() => props.registry.slots[activeTab.value]!)

const handleCodeChange = (code: string) => {
  props.registry.setCode(activeTab.value, code)
}

const handleValidate = () => {
  props.registry.validateSlot(activeTab.value)
}

const handleApplyTransform = () => {
  const slot = activeSlot.value
  if (!slot || !slot.isValid) return
  
  const args = slot.params
    .filter(p => p.name !== 'notes')
    .map(p => {
      const inputs = paramInputs.value[activeTab.value] || {}
      return inputs[p.name] || 0
    })
  
  const result = props.registry.applyTransform(activeTab.value, args)
  
  if (result.status === 'error') {
    alert(`Error: ${result.error}`)
  }
}

const handleInsertTemplate = () => {
  const template = `/**
 * Brief description of what this does.
 * @param {Note[]} notes - Input notes array
 * @param {number} amount - Parameter description (e.g., -12 to +12)
 */
function myTransform(notes, amount) {
  return notes.map(n => ({
    ...n,
    // transformation logic here
  }));
}`
  
  props.registry.setCode(activeTab.value, template)
}

const getParamInput = (paramName: string): number => {
  if (!paramInputs.value[activeTab.value]) {
    paramInputs.value[activeTab.value] = {}
  }
  return paramInputs.value[activeTab.value]![paramName] || 0
}

const setParamInput = (paramName: string, value: number) => {
  if (!paramInputs.value[activeTab.value]) {
    paramInputs.value[activeTab.value] = {}
  }
  paramInputs.value[activeTab.value]![paramName] = value
}
</script>

<template>
  <div class="transform-workbench">
    <div class="workbench-header">
      <h3>Transform Functions</h3>
      <div class="header-actions">
        <button 
          @click="handleInsertTemplate" 
          class="template-btn"
          title="Insert starter template"
        >
          📝 Template
        </button>
      </div>
    </div>

    <div class="tabs">
      <button
        v-for="(slot, index) in registry.slots"
        :key="index"
        @click="activeTab = index"
        :class="['tab', { active: activeTab === index, valid: slot.isValid }]"
      >
        {{ slot.name }}
        <span v-if="slot.isValid" class="valid-indicator">✓</span>
      </button>
    </div>

    <div class="tab-content">
      <div class="editor-section">
        <div class="editor-header">
          <div class="status">
            <span :class="['status-badge', activeSlot.isValid ? 'valid' : 'invalid']">
              {{ activeSlot.isValid ? '✓ Valid' : '⚠ Not Validated' }}
            </span>
            <button @click="handleValidate" class="validate-btn">
              Validate
            </button>
          </div>
        </div>

        <Codemirror
          :model-value="activeSlot.code"
          @update:model-value="handleCodeChange"
          :extensions="extensions"
          :style="{ height: '300px', fontSize: '14px' }"
          placeholder="Write your transform function here..."
        />

        <div v-if="activeSlot.errors.length > 0" class="errors">
          <h4>Validation Errors:</h4>
          <ul>
            <li v-for="(error, i) in activeSlot.errors" :key="i" class="error-item">
              {{ error }}
            </li>
          </ul>
        </div>

        <div v-if="activeSlot.isValid" class="params-info">
          <h4>Parameters:</h4>
          <div v-if="activeSlot.params.filter(p => p.name !== 'notes').length === 0" class="no-params">
            No parameters (transform operates on notes only)
          </div>
          <ul v-else>
            <li v-for="param in activeSlot.params.filter(p => p.name !== 'notes')" :key="param.name">
              <strong>{{ param.name }}</strong>
              <span v-if="param.description">: {{ param.description }}</span>
            </li>
          </ul>
        </div>
      </div>

      <div v-if="activeSlot.isValid" class="execute-section">
        <h4>Test Transform</h4>
        <div class="param-inputs">
          <div
            v-for="param in activeSlot.params.filter(p => p.name !== 'notes')"
            :key="param.name"
            class="param-input"
          >
            <label :for="`param-${param.name}`">
              {{ param.name }}
              <span v-if="param.description" class="param-hint">{{ param.description }}</span>
            </label>
            <input
              :id="`param-${param.name}`"
              type="number"
              :value="getParamInput(param.name)"
              @input="setParamInput(param.name, parseFloat(($event.target as HTMLInputElement).value))"
              step="0.1"
            />
          </div>
        </div>

        <div class="execute-actions">
          <button @click="handleApplyTransform" class="apply-btn">
            Apply Transform
          </button>
          <button @click="registry.undo()" :disabled="!registry.canUndo()" class="undo-btn">
            ↶ Undo
          </button>
          <button @click="registry.redo()" :disabled="!registry.canRedo()" class="redo-btn">
            ↷ Redo
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.transform-workbench {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
}

.workbench-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 8px;
  border-bottom: 2px solid #e0e4f0;
}

.workbench-header h3 {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
  color: #303553;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.template-btn {
  background: transparent;
  border: 1px solid #d5d9e6;
  border-radius: 6px;
  padding: 4px 12px;
  font-size: 0.85rem;
  color: #666;
  cursor: pointer;
  transition: all 0.15s ease;
}

.template-btn:hover {
  background: #f5f6f9;
  border-color: #999;
}

.tabs {
  display: flex;
  gap: 4px;
  overflow-x: auto;
  padding: 4px 0;
}

.tab {
  background: #f5f6f9;
  border: 1px solid #d5d9e6;
  border-radius: 6px 6px 0 0;
  padding: 8px 16px;
  font-size: 0.9rem;
  color: #666;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
  position: relative;
}

.tab:hover {
  background: #e8eaf0;
}

.tab.active {
  background: #fff;
  color: #303553;
  font-weight: 600;
  border-bottom-color: transparent;
}

.tab.valid {
  border-color: #28a745;
}

.valid-indicator {
  color: #28a745;
  margin-left: 6px;
  font-weight: bold;
}

.tab-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 16px;
  background: #fff;
  border: 1px solid #e0e4f0;
  border-radius: 8px;
  padding: 16px;
}

.editor-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.editor-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.status {
  display: flex;
  align-items: center;
  gap: 12px;
}

.status-badge {
  padding: 4px 12px;
  border-radius: 6px;
  font-size: 0.85rem;
  font-weight: 600;
}

.status-badge.valid {
  background: #d4edda;
  color: #155724;
}

.status-badge.invalid {
  background: #fff3cd;
  color: #856404;
}

.validate-btn {
  background: linear-gradient(135deg, #4a6cf7, #667aff);
  border: none;
  border-radius: 6px;
  color: white;
  padding: 6px 18px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
  box-shadow: 0 4px 12px rgba(74, 108, 247, 0.2);
}

.validate-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(74, 108, 247, 0.3);
}

.errors {
  background: #ffe0e0;
  border: 1px solid #ff5b6c;
  border-radius: 8px;
  padding: 12px;
}

.errors h4 {
  margin: 0 0 8px 0;
  color: #d32f2f;
  font-size: 0.9rem;
}

.errors ul {
  margin: 0;
  padding-left: 20px;
}

.error-item {
  color: #d32f2f;
  font-size: 0.85rem;
  margin: 4px 0;
}

.params-info {
  background: #e8f5e9;
  border: 1px solid #4caf50;
  border-radius: 8px;
  padding: 12px;
}

.params-info h4 {
  margin: 0 0 8px 0;
  color: #2e7d32;
  font-size: 0.9rem;
}

.params-info ul {
  margin: 0;
  padding-left: 20px;
}

.params-info li {
  color: #2e7d32;
  font-size: 0.85rem;
  margin: 4px 0;
}

.no-params {
  color: #666;
  font-size: 0.85rem;
  font-style: italic;
}

.execute-section {
  background: #f9fafb;
  border: 1px solid #e0e4f0;
  border-radius: 8px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.execute-section h4 {
  margin: 0;
  font-size: 1rem;
  color: #303553;
}

.param-inputs {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.param-input {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.param-input label {
  font-size: 0.9rem;
  font-weight: 600;
  color: #4d5268;
}

.param-hint {
  font-weight: normal;
  color: #666;
  font-size: 0.85rem;
  margin-left: 8px;
}

.param-input input {
  padding: 8px 12px;
  border: 1px solid #d5d9e6;
  border-radius: 6px;
  font-size: 0.9rem;
  font-family: monospace;
}

.param-input input:focus {
  outline: none;
  border-color: #4a6cf7;
  box-shadow: 0 0 0 3px rgba(74, 108, 247, 0.1);
}

.execute-actions {
  display: flex;
  gap: 8px;
  padding-top: 8px;
}

.apply-btn {
  background: linear-gradient(135deg, #28a745, #34d058);
  border: none;
  border-radius: 6px;
  color: white;
  padding: 8px 20px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
  box-shadow: 0 4px 12px rgba(40, 167, 69, 0.2);
  flex: 1;
}

.apply-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(40, 167, 69, 0.3);
}

.undo-btn,
.redo-btn {
  background: #f0f0f0;
  border: 1px solid #ccc;
  border-radius: 6px;
  padding: 8px 16px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.undo-btn:hover:not(:disabled),
.redo-btn:hover:not(:disabled) {
  background: #e0e0e0;
}

.undo-btn:disabled,
.redo-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
