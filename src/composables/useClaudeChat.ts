import { ref } from 'vue'
import Anthropic from '@anthropic-ai/sdk'
import type { NoteDataInput } from '../components/pianoRoll/pianoRollState'

export interface ChatMessage {
  role: 'user' | 'assistant'
  text: string
  timestamp: number
}

interface GridInfo {
  maxLength: number
  timeSignature: number
  subdivision: number
}

interface ClaudeChatConfig {
  getNotes: () => NoteDataInput[]
  setNotes: (notes: NoteDataInput[]) => void
  getGrid: () => GridInfo
}

const MAX_NOTES = 512
const MAX_TOOL_ITERATIONS = 3

function validateClampNotes(inputNotes: any[], grid: GridInfo): NoteDataInput[] {
  const notes = inputNotes.slice(0, MAX_NOTES)
  
  return notes.map((n, i) => {
    const pitch = Math.max(0, Math.min(127, Math.round(n.pitch ?? 60)))
    const position = Math.max(0, n.position ?? 0)
    const minDuration = 1 / grid.subdivision
    const duration = Math.max(minDuration, n.duration ?? 0.25)
    const velocity = Math.max(0, Math.min(127, n.velocity ?? 100))
    
    const maxDuration = Math.max(minDuration, grid.maxLength - position)
    
    return {
      id: n.id || `note-${Date.now()}-${i}`,
      pitch,
      position,
      duration: Math.min(duration, maxDuration),
      velocity
    }
  })
}

export function createClaudeChat(config: ClaudeChatConfig) {
  const { getNotes, setNotes, getGrid } = config
  
  const messages = ref<ChatMessage[]>([])
  const isWaiting = ref(false)
  const error = ref<string | null>(null)
  
  const tools: Anthropic.Tool[] = [{
    name: "midi_notes",
    description: "Read or write the piano roll MIDI notes. Use action='read' to fetch all notes. Use action='write' with a notes array to replace the current notes.",
    input_schema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["read", "write"],
          description: "Whether to read current notes or write new notes"
        },
        notes: {
          type: "array",
          description: "Array of MIDI notes to write (only for 'write' action)",
          items: {
            type: "object",
            properties: {
              id: { type: "string", description: "Optional unique identifier" },
              pitch: { 
                type: "number", 
                minimum: 0, 
                maximum: 127,
                description: "MIDI pitch (0-127, 60=middle C)"
              },
              position: { 
                type: "number", 
                minimum: 0,
                description: "Note start position in quarter notes"
              },
              duration: { 
                type: "number", 
                minimum: 0,
                description: "Note duration in quarter notes"
              },
              velocity: { 
                type: "number", 
                minimum: 0, 
                maximum: 127,
                description: "Note velocity (0-127, default 100)"
              }
            },
            required: ["pitch", "position", "duration"]
          }
        }
      },
      required: ["action"]
    }
  }]
  
  function buildSystemPrompt(): string {
    const grid = getGrid()
    return `You are a music composition assistant for a MIDI piano roll editor.

IMPORTANT RULES:
- Always use the midi_notes tool to read or write notes - never hallucinate note data
- Grid constraints: maxLength=${grid.maxLength} quarter notes, timeSignature=${grid.timeSignature}/4, subdivision=1/${grid.subdivision}
- When writing notes:
  - Pitch must be 0-127 (60=middle C, 62=D, 64=E, 65=F, 67=G, 69=A, 71=B, 72=high C)
  - Position must be >= 0 and position+duration should stay within maxLength
  - Duration must be > 0 (minimum 1/${grid.subdivision} quarter notes recommended)
  - Velocity defaults to 100 if not specified (range 0-127)
- Keep responses concise and acknowledge changes after writing
- Consider musical context when suggesting edits (key, rhythm, harmony)
- When creating chords, use simultaneous notes at the same position`
  }
  
  async function executeMidiNotesTool(input: any) {
    const grid = getGrid()
    
    if (input.action === 'read') {
      return {
        notes: getNotes(),
        grid
      }
    } else if (input.action === 'write') {
      const normalized = validateClampNotes(input.notes || [], grid)
      setNotes(normalized)
      return {
        status: 'ok',
        count: normalized.length,
        grid
      }
    }
    
    return { error: 'Invalid action' }
  }
  
  async function send(userText: string, apiKey: string): Promise<void> {
    if (!apiKey.trim()) {
      error.value = 'Please provide an API key'
      return
    }
    
    if (!userText.trim()) {
      return
    }
    
    messages.value.push({
      role: 'user',
      text: userText,
      timestamp: Date.now()
    })
    
    isWaiting.value = true
    error.value = null
    
    try {
      const client = new Anthropic({
        apiKey,
        dangerouslyAllowBrowser: true
      })
      
      const conversationMessages: Anthropic.MessageParam[] = [
        { role: 'user', content: userText }
      ]
      
      let response = await client.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        system: buildSystemPrompt(),
        tools,
        max_tokens: 1000,
        messages: conversationMessages
      })
      
      for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
        const toolUses = response.content.filter(
          (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
        )
        
        if (toolUses.length === 0) break
        
        conversationMessages.push({
          role: 'assistant',
          content: response.content
        })
        
        const toolResults: Anthropic.ToolResultBlockParam[] = []
        
        for (const toolUse of toolUses) {
          if (toolUse.name === 'midi_notes') {
            const result = await executeMidiNotesTool(toolUse.input)
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: JSON.stringify(result)
            })
          }
        }
        
        conversationMessages.push({
          role: 'user',
          content: toolResults
        })
        
        response = await client.messages.create({
          model: 'claude-3-5-sonnet-20241022',
          system: buildSystemPrompt(),
          tools,
          max_tokens: 1000,
          messages: conversationMessages
        })
      }
      
      const finalText = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map(block => block.text)
        .join('\n')
      
      messages.value.push({
        role: 'assistant',
        text: finalText || 'No response',
        timestamp: Date.now()
      })
      
    } catch (err: any) {
      error.value = err.message || 'Failed to communicate with Claude'
      console.error('Claude API error:', err)
    } finally {
      isWaiting.value = false
    }
  }
  
  function reset() {
    messages.value = []
    error.value = null
    isWaiting.value = false
  }
  
  return {
    messages,
    isWaiting,
    error,
    send,
    reset
  }
}
