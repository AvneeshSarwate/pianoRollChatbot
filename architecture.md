# Piano Roll Chatbot Architecture

## 1. Overview
The application is a Vite/Vue 3 (TypeScript-first) single-page experience that showcases the in-repo piano roll component and augments it with a client-side Claude chatbot. The chatbot provides conversational access to the MIDI data by exposing a single tool capable of reading from and writing to the roll. The user supplies an Anthropic API key directly in the browser; no backend proxy is involved.

```
┌────────────────────┐     ┌────────────────────┐     ┌─────────────────────┐
│ Piano Roll Demo UI │──►──│ Claude Chat Widget │──►──│ Claude Messages API  │
└────────┬───────────┘     └────────┬───────────┘     └────────┬────────────┘
         │                            ▲                         │
         ▼                            │                         ▼
  Piano Roll Bridge  ◄────────────────┘                 Anthropic Tool Calls
```

## 2. UI Composition
- `App.vue`: Hosts the landing copy and mounts the `PianoRollDemo` component.
- `PianoRollDemo.vue`: Displays the piano roll, Tone.js transport controls, live timeline preview (p5.js), and the chatbot widget.
- `ClaudeChat.vue` (new): Conversational interface with:
  - API key entry form (session/local storage opt-in).
  - Scrollable message history aligned with the main theme.
  - Textarea input and submit button.
  - “Waiting for response…” indicator while Claude generates replies.
  - Error banner for networking or tool execution failures.

## 3. Piano Roll Bridge
Purpose: decouple the chatbot from direct component refs.

`src/lib/pianoRollBridge.ts` (proposed API):
```ts
type GridSnapshot = {
  maxLength: number
  timeSignature: number
  subdivision: number
}

export type Bridge = {
  readNotes(): NoteDataInput[]
  writeNotes(notes: NoteDataInput[]): void
  readGrid(): GridSnapshot
}
```

Implementation notes:
- The bridge is registered by `PianoRollDemo` once the `PianoRollRoot` ref is ready.
- Writes clamp and validate note values (pitch range, duration bounds, grid length).
- Reads return the canonical note objects used by the piano roll core.

## 4. Chat / Claude Layer

### Claude Client
- `src/lib/claudeClient.ts`: Thin wrapper around `fetch` (or `@anthropic-ai/sdk` if desired) that:
  - Accepts the user API key per request.
  - Sends `POST https://api.anthropic.com/v1/messages`.
  - Adds required headers: `x-api-key`, `anthropic-version`, `content-type`.
  - Supports tool definitions via `tools` and `tool_choice`.
  - Returns strongly typed payloads for `content`, `tool_use`, and `text` segments.

### Conversation Manager
- `src/composables/useClaudeChat.ts`:
  - Maintains reactive `messages`, `isWaiting`, `error`.
  - Exposes `send(userText: string, apiKey: string)` which:
    1. Pushes user message to local state.
    2. Calls the Claude API with the current transcript plus system prompt.
    3. Handles tool calls by routing to the bridge (see section 5).
    4. Appends Claude replies to the history.
  - Caps tool-call recursion (e.g., max 3 sequential calls) to avoid infinite loops.
  - Trims older messages when exceeding context budget.

## 5. Tool Execution Flow
The Claude tool schema advertises a single tool `piano_roll_notes` with two possible actions: `"read"` (no payload) and `"write"` (payload = array of note objects).

Execution steps:
1. Claude response contains `{ type: 'tool_use', name: 'piano_roll_notes', input: {...} }`.
2. The chat composable validates the `input` against the schema.
3. Dispatcher calls `bridge.readNotes()` or `bridge.writeNotes()` as appropriate.
4. The tool result is wrapped in a `tool` role message and appended to the conversation.
5. Another request is sent to Claude containing the updated transcript so it can complete its reply.

Validation rules for writes:
- Clamp pitches to `[0, 127]`.
- Clamp positions to `[0, grid.maxLength]`.
- Clamp duration to `[1/subdivision, grid.maxLength - position]`.
- Clamp velocity to `[0, 127]`.
- Limit the number of notes (e.g., 512) per write to prevent pathological payloads.

## 6. Data Flow Summary

```
User text ──► Chat UI ──► useClaudeChat ──► Claude API
                                       │            │
                                       │            ▼
                                       ├── tool_use request
                                       │
                                       ▼
                             pianoRollBridge ──► PianoRollRoot
```

- The p5 timeline preview and Tone.js playback already respond to changes in `timelineState`, so any edits executed via the chatbot immediately reflect in the UI and audio.

## 7. Security & Privacy Considerations
- API key lives only client-side; display warnings about exposure risk.
- Optionally store the key in `sessionStorage` with explicit consent checkbox.
- Use abort controllers and timeout guards to avoid runaway requests.
- Sanitize tool inputs before applying to the piano roll.

## 8. Extensibility
- Add conversation persistence (IndexedDB) for session continuity.
- Support multiple models or temperature controls in the chat widget.
- Expand tooling with additional primitives (e.g., quantize selection, randomize velocity).
- Introduce streaming UI once Anthropic streaming support is exposed client-side.

## 9. Testing Strategy
- Manual smoke tests for read/write scenarios.
- Unit tests for bridge validation helpers.
- Mocked Claude responses (tool_use + text) to exercise the conversation manager without real API calls.

This architecture maintains a clear separation between UI, conversational logic, and piano roll data access, keeping the codebase modular and testable while meeting the requirement of a client-only Claude integration.
