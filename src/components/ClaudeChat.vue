<script setup lang="ts">
import { ref, nextTick } from 'vue'
import { createClaudeChat } from '../composables/useClaudeChat'
import type { NoteDataInput } from './pianoRoll/pianoRollState'
import type { TransformRegistry } from '../composables/useTransformRegistry'

interface Props {
  getNotes: () => NoteDataInput[]
  setNotes: (notes: NoteDataInput[]) => void
  getGrid: () => { maxLength: number; timeSignature: number; subdivision: number }
  registry?: TransformRegistry
}

const props = defineProps<Props>()

const chat = createClaudeChat({
  getNotes: props.getNotes,
  setNotes: props.setNotes,
  getGrid: props.getGrid,
  registry: props.registry
})

const apiKey = ref('')
const userInput = ref('')
const messagesContainer = ref<HTMLDivElement | null>(null)
const showApiKeyWarning = ref(true)
const showApiKey = ref(false)

const scrollToBottom = async () => {
  await nextTick()
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  }
}

const handleSend = async () => {
  if (!userInput.value.trim() || chat.isWaiting.value) return
  
  const message = userInput.value
  userInput.value = ''
  
  await chat.send(message, apiKey.value)
  await scrollToBottom()
}

const handleKeyDown = (event: KeyboardEvent) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    handleSend()
  }
}

const formatTime = (timestamp: number) => {
  return new Date(timestamp).toLocaleTimeString([], { 
    hour: '2-digit', 
    minute: '2-digit' 
  })
}
</script>

<template>
  <div class="claude-chat">
    <div class="chat-header">
      <h3>AI Music Assistant</h3>
      <button 
        v-if="chat.messages.value.length > 0" 
        @click="chat.reset()" 
        class="reset-btn"
        :disabled="chat.isWaiting.value"
      >
        Clear Chat
      </button>
    </div>

    <div class="api-key-section">
      <div class="api-key-label-row">
        <label for="api-key">
          Claude API Key
          <span class="required">*</span>
        </label>
        <button 
          type="button"
          @click="showApiKey = !showApiKey" 
          class="toggle-visibility-btn"
        >
          {{ showApiKey ? '👁️ Hide' : '👁️‍🗨️ Show' }}
        </button>
      </div>
      <input
        id="api-key"
        v-model="apiKey"
        :type="showApiKey ? 'text' : 'password'"
        placeholder="sk-ant-..."
        class="api-key-input"
        autocomplete="off"
        spellcheck="false"
      />
      <div v-if="showApiKeyWarning" class="warning">
        <span class="warning-icon">⚠️</span>
        <div class="warning-content">
          <strong>Security Warning:</strong> This API key is exposed in your browser. 
          Use a limited, revocable key. Never use production keys.
          <button @click="showApiKeyWarning = false" class="dismiss-btn">Dismiss</button>
        </div>
      </div>
    </div>

    <div class="messages-container" ref="messagesContainer">
      <div v-if="chat.messages.value.length === 0" class="empty-state">
        <p>👋 Ask me to create, modify, or analyze the music in your piano roll!</p>
        <div class="examples">
          <p><strong>Try:</strong></p>
          <ul>
            <li>"What notes are currently in the piano roll?"</li>
            <li>"Create a C major chord at beat 0"</li>
            <li>"Add a simple melody starting at beat 4"</li>
          </ul>
        </div>
      </div>

      <div
        v-for="(message, index) in chat.messages.value"
        :key="index"
        class="message"
        :class="message.role"
      >
        <div class="message-header">
          <span class="role-label">{{ message.role === 'user' ? 'You' : 'AI Assistant' }}</span>
          <span class="timestamp">{{ formatTime(message.timestamp) }}</span>
        </div>
        
        <div v-if="message.toolCalls && message.toolCalls.length > 0" class="tool-calls">
          <div class="tool-call-header">🔧 Tools used:</div>
          <div v-for="(toolCall, idx) in message.toolCalls" :key="idx" class="tool-call">
            <span class="tool-name">{{ toolCall.displayName || toolCall.name }}</span>
            <span v-if="Object.keys(toolCall.input).length > 0" class="tool-params">
              ({{ Object.entries(toolCall.input).map(([k, v]) => `${k}: ${v}`).join(', ') }})
            </span>
          </div>
        </div>
        
        <div class="message-text">{{ message.text }}</div>
      </div>

      <div v-if="chat.isWaiting.value" class="message assistant waiting">
        <div class="message-header">
          <span class="role-label">AI Assistant</span>
        </div>
        <div class="message-text">
          <span class="loading-dots">Thinking</span>
        </div>
      </div>
    </div>

    <div v-if="chat.error.value" class="error-message">
      <strong>Error:</strong> {{ chat.error.value }}
    </div>

    <div class="input-container">
      <textarea
        v-model="userInput"
        @keydown="handleKeyDown"
        placeholder="Ask me to create or modify music..."
        class="user-input"
        rows="2"
        :disabled="chat.isWaiting.value || !apiKey"
      ></textarea>
      <button
        @click="handleSend"
        class="send-btn"
        :disabled="chat.isWaiting.value || !userInput.trim() || !apiKey"
      >
        Send
      </button>
    </div>
  </div>
</template>

<style scoped>
.claude-chat {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
  max-height: 600px;
}

.chat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 8px;
  border-bottom: 2px solid #e0e4f0;
}

.chat-header h3 {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
  color: #303553;
}

.reset-btn {
  background: transparent;
  border: 1px solid #d5d9e6;
  border-radius: 6px;
  padding: 4px 12px;
  font-size: 0.85rem;
  color: #666;
  cursor: pointer;
  transition: all 0.15s ease;
}

.reset-btn:hover:not(:disabled) {
  background: #f5f6f9;
  border-color: #999;
}

.reset-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.api-key-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.api-key-label-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.api-key-section label {
  font-size: 0.9rem;
  font-weight: 600;
  color: #4d5268;
}

.toggle-visibility-btn {
  background: transparent;
  border: 1px solid #d5d9e6;
  border-radius: 6px;
  padding: 4px 12px;
  font-size: 0.85rem;
  color: #666;
  cursor: pointer;
  transition: all 0.15s ease;
}

.toggle-visibility-btn:hover {
  background: #f5f6f9;
  border-color: #999;
}

.required {
  color: #ff5b6c;
}

.api-key-input {
  padding: 8px 12px;
  border: 1px solid #d5d9e6;
  border-radius: 8px;
  font-size: 0.9rem;
  font-family: monospace;
  transition: border-color 0.15s ease;
}

.api-key-input:focus {
  outline: none;
  border-color: #4a6cf7;
  box-shadow: 0 0 0 3px rgba(74, 108, 247, 0.1);
}

.warning {
  display: flex;
  gap: 8px;
  padding: 10px;
  background: #fff3cd;
  border: 1px solid #ffc107;
  border-radius: 8px;
  font-size: 0.85rem;
  color: #856404;
}

.warning-icon {
  font-size: 1.2rem;
  flex-shrink: 0;
}

.warning-content {
  flex: 1;
}

.dismiss-btn {
  margin-left: 8px;
  padding: 2px 8px;
  background: transparent;
  border: 1px solid #856404;
  border-radius: 4px;
  font-size: 0.8rem;
  color: #856404;
  cursor: pointer;
  transition: all 0.15s ease;
}

.dismiss-btn:hover {
  background: #856404;
  color: #fff;
}

.messages-container {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  background: #f9fafb;
  border: 1px solid #e0e4f0;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 200px;
  max-height: 350px;
}

.empty-state {
  text-align: center;
  color: #666;
  padding: 20px;
}

.empty-state p {
  margin: 0 0 16px 0;
  font-size: 1rem;
}

.examples {
  text-align: left;
  background: #fff;
  padding: 16px;
  border-radius: 8px;
  border: 1px solid #e0e4f0;
}

.examples p {
  margin: 0 0 8px 0;
  font-weight: 600;
  color: #4d5268;
}

.examples ul {
  margin: 0;
  padding-left: 20px;
}

.examples li {
  margin: 6px 0;
  color: #666;
  font-size: 0.9rem;
}

.message {
  padding: 10px 12px;
  border-radius: 8px;
  max-width: 90%;
  animation: slideIn 0.2s ease;
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.message.user {
  align-self: flex-end;
  background: linear-gradient(135deg, #4a6cf7, #667aff);
  color: white;
}

.message.assistant {
  align-self: flex-start;
  background: #ffffff;
  border: 1px solid #e0e4f0;
  color: #2f3542;
}

.message.waiting {
  opacity: 0.8;
}

.message-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
  gap: 12px;
}

.role-label {
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.message.user .role-label {
  color: rgba(255, 255, 255, 0.9);
}

.message.assistant .role-label {
  color: #4a6cf7;
}

.timestamp {
  font-size: 0.7rem;
  opacity: 0.7;
}

.message-text {
  font-size: 0.9rem;
  line-height: 1.5;
  white-space: pre-wrap;
  word-wrap: break-word;
}

.tool-calls {
  margin-bottom: 8px;
  padding: 8px;
  background: rgba(0, 0, 0, 0.05);
  border-radius: 6px;
  font-size: 0.85rem;
}

.tool-call-header {
  font-weight: 600;
  margin-bottom: 4px;
  opacity: 0.9;
}

.tool-call {
  margin: 2px 0;
  padding-left: 8px;
}

.tool-name {
  font-weight: 600;
  font-family: monospace;
  color: #4a6cf7;
}

.message.user .tool-name {
  color: rgba(255, 255, 255, 0.95);
}

.tool-params {
  font-family: monospace;
  opacity: 0.8;
  margin-left: 4px;
}

.loading-dots::after {
  content: '...';
  animation: dots 1.5s steps(4, end) infinite;
}

@keyframes dots {
  0%, 20% {
    content: '.';
  }
  40% {
    content: '..';
  }
  60%, 100% {
    content: '...';
  }
}

.error-message {
  padding: 10px 12px;
  background: #ffe0e0;
  border: 1px solid #ff5b6c;
  border-radius: 8px;
  color: #d32f2f;
  font-size: 0.9rem;
}

.input-container {
  display: flex;
  gap: 8px;
  align-items: flex-end;
}

.user-input {
  flex: 1;
  padding: 10px 12px;
  border: 1px solid #d5d9e6;
  border-radius: 8px;
  font-size: 0.9rem;
  font-family: inherit;
  resize: none;
  transition: border-color 0.15s ease;
}

.user-input:focus {
  outline: none;
  border-color: #4a6cf7;
  box-shadow: 0 0 0 3px rgba(74, 108, 247, 0.1);
}

.user-input:disabled {
  background: #f5f6f9;
  cursor: not-allowed;
}

.send-btn {
  padding: 10px 24px;
  background: linear-gradient(135deg, #4a6cf7, #667aff);
  border: none;
  border-radius: 8px;
  color: white;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
  box-shadow: 0 4px 12px rgba(74, 108, 247, 0.2);
  white-space: nowrap;
}

.send-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(74, 108, 247, 0.3);
}

.send-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  box-shadow: none;
}
</style>
