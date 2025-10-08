# Transform Functions Implementation Plan

## Overview

Add programmable transformation functions to the piano roll chatbot, enabling users to write custom JavaScript transforms and allowing Claude to generate them dynamically. Each transform operates on the piano roll note data with numeric parameters.

## Architecture

### Components

1. **TransformWorkbench.vue** - Tabbed code editor interface
   - 8 CodeMirror editor tabs
   - Validate button per tab
   - Status display (Valid/Invalid)
   - Parameter preview from JSDoc
   - Manual execution with numeric inputs
   - Undo/Redo buttons

2. **useTransformRegistry.ts** - Composable managing transform lifecycle
   - Slot state (code, validation, compilation)
   - Acorn-based validation
   - Function compilation via `new Function()`
   - Claude tool definition generation
   - Execution with grid clamping
   - Undo/redo stack

3. **Updated useClaudeChat.ts** - Extended chat integration
   - Dynamic tool registration from registry
   - `write_transform_function` tool for AI authoring
   - System prompt with transform catalog
   - Tool routing via handler map

## Transform Function Structure

Each transform must follow this pattern:

```javascript
/**
 * Brief description of what the transform does.
 * @param {Note[]} notes - Input notes array
 * @param {number} paramName1 - Description of first parameter
 * @param {number} paramName2 - Description of second parameter
 */
function transform(notes, paramName1, paramName2) {
  const newNotes = notes.map(n => {...n})
  //transform new notes here
  return newNotes
}
```

**Requirements:**
- Function must be named `transform`
- First parameter must be `notes`
- Remaining parameters assumed to be numbers
- JSDoc block comment required
- One JSDoc line per parameter (simple substring check)

## Validation Logic (acorn.js)

### Parsing Steps

1. **Parse with acorn**
   ```typescript
   const ast = Parser.parse(code, {
     ecmaVersion: 'latest',
     locations: true,
     onComment: (isBlock, text, start, end) => { /* collect */ }
   });
   ```

2. **Find function declaration**
   - Look for `FunctionDeclaration` named `transform`, OR
   - Look for `VariableDeclarator` with `id='transform'` and function init

3. **Extract parameters**
   - First param must be an `Identifier` (notes)
   - Remaining params must be `Identifier` (no destructuring)
   - Store param names

4. **Validate JSDoc**
   - Find preceding block comment starting with `/**`
   - For each parameter, verify at least one line contains the param name
   - Optional: Parse `@param {number} paramName - description` with regex

5. **Compile function**
   ```typescript
   const factory = new Function(
     '"use strict";\n' + 
     code + 
     '\nif (typeof transform !== "function") throw new Error("transform not defined");\n' +
     'return transform;'
   );
   const fn = factory();
   ```

6. **Smoke test**
   ```typescript
   const result = fn([]);
   if (!Array.isArray(result)) throw new Error("transform must return array");
   ```

7. **Store compiled function**
   - Save to slot with metadata
   - Mark as validated
   - Generate Claude tool definition

### Validation Result

```typescript
interface ValidationResult {
  valid: boolean;
  errors: string[];
  params?: Array<{ name: string; description?: string }>;
  jsdocSummary?: string;
  compiled?: Function;
}
```

## Claude Tool Integration

### Dynamic Tool Registration

Each validated slot generates a tool:

```typescript
{
  name: `transform_slot_${index + 1}`,
  description: /* First line of JSDoc or "User-defined transform in slot N" */,
  input_schema: {
    type: "object",
    properties: {
      paramName1: {
        type: "number",
        description: /* Extracted from JSDoc */
      },
      paramName2: {
        type: "number",
        description: /* Extracted from JSDoc */
      }
    },
    required: [/* all param names */]
  }
}
```

### write_transform_function Tool

New tool for Claude to author transforms:

```typescript
{
  name: "write_transform_function",
  description: "Create or overwrite a transform function in a given slot (0-7). Provide complete JavaScript code with a function named 'transform' that takes notes as first parameter, followed by numeric parameters. Include JSDoc comments with one line per parameter.",
  input_schema: {
    type: "object",
    properties: {
      slotIndex: {
        type: "number",
        minimum: 0,
        maximum: 7,
        description: "Slot index (0-7) where to write the transform"
      },
      code: {
        type: "string",
        description: "Complete JavaScript code defining the transform function"
      }
    },
    required: ["slotIndex", "code"]
  }
}
```

**Handler:**
```typescript
async function handleWriteTransform(input: { slotIndex: number; code: string }) {
  const result = registry.writeTransformFunction(input.slotIndex, input.code);
  return {
    status: result.valid ? 'validated' : 'invalid',
    errors: result.errors,
    toolName: result.valid ? `transform_slot_${input.slotIndex + 1}` : undefined,
    params: result.params
  };
}
```

## System Prompt Additions

Append to `buildSystemPrompt()`:

### Recommended Approach (Based on Anthropic Best Practices)

The system prompt should:
1. **Guide tool selection logic** - Help Claude understand WHEN to use transforms vs direct note manipulation
2. **Provide usage context** - Go beyond tool descriptions to explain patterns and best practices
3. **Include "chain of thought" prompting** - For deliberate tool selection (especially for Sonnet/Haiku)

**System Prompt Template:**

```
TRANSFORM FUNCTIONS:
Before modifying notes, determine the best approach:
- For simple operations (add/remove individual notes, simple pitch/position changes), use midi_notes tool directly
- For pattern-based operations (transpose all notes, quantize, humanize), check if an existing transform tool matches
- For complex multi-step operations, consider combining multiple transform tools in sequence
- Only create new transforms if no existing tool or combination fits the need

Available transform tools:
${registry.summarizeTransforms()}

When using a transform tool, you may guess the value based on your understanding of the user's intent and the source code of the transform.

CREATING NEW TRANSFORMS:
Use write_transform_function(code, slotIndex) only when the user explicitly asks you to create or modify a transform function


Transform code requirements:
- Must define: function transform(notes, ...numbers) { return transformedNotes; }
- First parameter must be 'notes' (the input array)
- Additional parameters must be numbers that configure the transformation
- Must include JSDoc with @param tags for each parameter
- Should return a new array, not modify input array

Example transform structure:
/**
 * Brief description of what this does.
 * @param {Note[]} notes - Input notes array
 * @param {number} paramName - Description and recommended range (e.g., 0-127, -12 to +12)
 */
function transform(notes, paramName) {
  const newNotes = notes.map(n => ({...n}));
  // transformations here
  return newNotes;
}

WORKFLOW for applying transforms:
1. Identify which transform tool (if any) matches the user's request
2. Check if you have all required parameter values
3. Apply the transform with correct arguments
4. Confirm the changes made to the user
```

### Alternative: Minimal Approach

If the detailed approach feels too verbose, a minimal version:

```
AVAILABLE TRANSFORM TOOLS:
${registry.summarizeTransforms()}

USING TRANSFORMS:
- Check existing transform tools before writing new ones
- If required parameters are missing, ask the user (don't guess)
- Use write_transform_function(code, slotIndex) to create new transforms only when needed
- New transforms must follow: function transform(notes, ...numbers) with JSDoc @param tags

WORKFLOW: Identify tool → Gather parameters → Apply → Confirm
```

## State Management

### Transform Registry State

```typescript
interface TransformSlot {
  code: string;
  isValid: boolean;
  name: string; // e.g., "Slot 1"
  params: Array<{ name: string; description?: string }>;
  errors: string[];
  compiled?: (notes: NoteDataInput[], ...args: number[]) => NoteDataInput[];
  jsdocSummary?: string;
}

interface TransformRegistry {
  slots: TransformSlot[8];
  undoStack: NoteDataInput[][];
  redoStack: NoteDataInput[][];
  
  // API
  setCode(slotIndex: number, code: string): void;
  validateSlot(slotIndex: number): ValidationResult;
  applyTransform(slotIndex: number, args: number[]): { status: string; count: number };
  undo(): void;
  redo(): void;
  getToolDefs(): Anthropic.Tool[];
  getToolHandlers(): Map<string, (input: any) => Promise<any>>;
  writeTransformFunction(slotIndex: number, code: string): ValidationResult;
  summarizeTransforms(): string;
}
```

### Execution Flow

```typescript
function applyTransform(slotIndex: number, args: number[]) {
  const slot = slots[slotIndex];
  if (!slot.isValid || !slot.compiled) {
    return { status: 'error', message: 'Slot not validated' };
  }
  
  // Capture for undo
  const prevNotes = getNotes();
  undoStack.push(prevNotes);
  redoStack.length = 0; // Clear redo on new action
  
  // Execute transform
  const result = slot.compiled(prevNotes, ...args);
  
  // Clamp and normalize
  const normalized = validateClampNotes(result, getGrid());
  
  // Update piano roll
  setNotes(normalized);
  
  return { status: 'ok', count: normalized.length };
}
```

## Implementation Steps

### 1. Transform Registry (1-3 hours)

**File:** `src/composables/useTransformRegistry.ts`

- [ ] Create `TransformSlot` and `TransformRegistry` interfaces
- [ ] Implement slot state (8 slots initialized with empty code)
- [ ] Implement `validateClampNotes()` (copy from useClaudeChat)
- [ ] Implement `setCode()` - mark slot as invalid when code changes
- [ ] Implement `validateSlot()`:
  - Parse with acorn
  - Find `transform` function
  - Extract parameters
  - Validate JSDoc
  - Compile with `new Function()`
  - Smoke test
  - Store compiled function and metadata
- [ ] Implement `applyTransform()` with undo/redo
- [ ] Implement `undo()` and `redo()`
- [ ] Implement `getToolDefs()` - generate tool definitions from valid slots
- [ ] Implement `getToolHandlers()` - create execution handlers
- [ ] Implement `writeTransformFunction()` - call validateSlot and return result
- [ ] Implement `summarizeTransforms()` - format catalog for system prompt

### 2. Transform Workbench UI (1-3 hours)

**File:** `src/components/TransformWorkbench.vue`

- [ ] Install dependencies: `npm install codemirror vue-codemirror @codemirror/lang-javascript acorn acorn-walk`
- [ ] Create tabbed interface (8 tabs)
- [ ] Integrate CodeMirror 6 with JavaScript language support
- [ ] Add "Validate" button per tab
- [ ] Display validation status (Valid/Invalid) and errors
- [ ] Show parsed parameters with descriptions
- [ ] Add numeric inputs for manual execution
- [ ] Add "Apply Transform" button
- [ ] Add Undo/Redo buttons
- [ ] Add "Insert Template" button with starter code
- [ ] Wire up to registry: `setCode()` on edit, `validateSlot()` on validate
- [ ] Style to match existing app theme

### 3. Chat Integration Updates (1-3 hours)

**Files:** 
- `src/composables/useClaudeChat.ts`
- `src/components/ClaudeChat.vue`

**useClaudeChat.ts:**
- [ ] Add optional `registry` parameter to `createClaudeChat()`
- [ ] Create handler map for all tools
- [ ] Add `midi_notes` handler (existing logic)
- [ ] Add `write_transform_function` handler
- [ ] Merge registry handlers if registry provided
- [ ] Update `buildSystemPrompt()` to include transform catalog
- [ ] Update tool execution loop to use handler map
- [ ] Rebuild tools array on each `send()` to get latest validated slots

**ClaudeChat.vue:**
- [ ] Update to accept `registry` prop
- [ ] Pass registry to `createClaudeChat()`

### 4. Wiring in PianoRollDemo (<1 hour)

**File:** `src/components/PianoRollDemo.vue`

- [ ] Import `useTransformRegistry` and `TransformWorkbench`
- [ ] Create registry instance: `const registry = useTransformRegistry({ getNotes, setNotes, getGrid })`
- [ ] Add `<TransformWorkbench>` component to layout
- [ ] Pass registry to `<ClaudeChat :registry="registry">`

### 5. Testing & Polish (1-2 hours)

- [ ] Test manual validation and execution
- [ ] Test Claude writing a transform via `write_transform_function`
- [ ] Test Claude using a validated transform tool
- [ ] Test undo/redo
- [ ] Test validation error messages
- [ ] Create example transforms:
  - Transpose (shift all pitches by semitones)
  - Humanize velocity (add random variation)
  - Quantize positions (snap to grid)
  - Octave doubler (duplicate notes 12 semitones up)
- [ ] Add helpful error messages with line numbers
- [ ] Polish UI/UX

## Example Transforms

### 1. Transpose

```javascript
/**
 * Transpose all notes by a fixed number of semitones.
 * @param {Note[]} notes - Input notes array
 * @param {number} semitones - Semitone shift (+12 = octave up, -12 = octave down, 0-127 range)
 */
function transform(notes, semitones) {
  return notes.map(n => ({
    ...n,
    pitch: Math.max(0, Math.min(127, (n.pitch ?? 60) + semitones))
  }));
}
```

### 2. Humanize Velocity

```javascript
/**
 * Add random variation to note velocities for humanization.
 * @param {Note[]} notes - Input notes array
 * @param {number} amount - Variation amount (0-20 recommended)
 */
function transform(notes, amount) {
  return notes.map(n => ({
    ...n,
    velocity: Math.max(0, Math.min(127, 
      (n.velocity ?? 100) + (Math.random() - 0.5) * amount
    ))
  }));
}
```

### 3. Quantize

```javascript
/**
 * Quantize note positions to nearest grid subdivision.
 * @param {Note[]} notes - Input notes array
 * @param {number} subdivision - Grid subdivision (4=quarter, 8=eighth, 16=sixteenth)
 * @param {number} strength - Quantize strength (0-1, where 1 = full quantize)
 */
function transform(notes, subdivision, strength) {
  const step = 4 / subdivision; // quarter notes per step
  return notes.map(n => {
    const quantized = Math.round(n.position / step) * step;
    const newPos = n.position + (quantized - n.position) * strength;
    return { ...n, position: Math.max(0, newPos) };
  });
}
```

### 4. Octave Doubler

```javascript
/**
 * Duplicate all notes one or more octaves up or down.
 * @param {Note[]} notes - Input notes array
 * @param {number} octaves - Number of octaves to double (+1, +2, -1, etc.)
 */
function transform(notes, octaves) {
  const shift = octaves * 12;
  const doubled = notes.map(n => ({
    ...n,
    id: `${n.id}-doubled`,
    pitch: Math.max(0, Math.min(127, (n.pitch ?? 60) + shift))
  }));
  return [...notes, ...doubled];
}
```

## Dependencies to Install

```bash
npm install codemirror vue-codemirror @codemirror/lang-javascript @codemirror/theme-one-dark acorn acorn-walk
```

## Security Considerations

⚠️ **Code Execution Risks**

- Transform code runs via `new Function()` with access to global scope
- **Mitigations:**
  - Prepend `"use strict";` to compiled code
  - Warn users not to paste untrusted code
  - Keep transforms simple and focused on note manipulation
  - Future: Move to Web Worker sandbox for public deployments

**Best Practices:**
- Encourage pure functions (no side effects)
- Validate output is always an array
- Clamp all numeric values to valid MIDI ranges
- Cap undo stack at 20 entries to prevent memory issues

## Future Enhancements

### Advanced Path (Optional)

1. **Web Worker Sandbox**
   - Execute transforms in isolated Worker context
   - Implement timeout mechanism
   - Use Comlink for messaging

2. **Transform Pipelines**
   - Chain multiple transforms
   - Save/load pipeline presets
   - Expose pipelines as composite tools

3. **Richer Type Checking**
   - TypeScript transform support
   - Stronger JSDoc/TSDoc parsing with doctrine/comment-parser
   - Extract min/max ranges from JSDoc

4. **Persistence**
   - Save transforms to localStorage
   - Import/export transform libraries
   - Share transforms between users

## Effort Estimate

| Task | Effort | Time |
|------|--------|------|
| Transform Registry | Medium | 1-3 hours |
| Transform Workbench UI | Medium | 1-3 hours |
| Chat Integration | Medium | 1-3 hours |
| Wiring & Setup | Small | <1 hour |
| Testing & Polish | Small-Medium | 1-2 hours |
| **Total** | **Medium-Large** | **4-10 hours** |

## Success Criteria

- [ ] Users can write and validate transform functions in 8 tabs
- [ ] Validated transforms appear as Claude tools automatically
- [ ] Claude can write new transforms via `write_transform_function` tool
- [ ] Transforms execute with proper grid clamping
- [ ] Undo/redo works for transform applications
- [ ] Validation errors are clear and helpful
- [ ] System prompt guides Claude to use/combine existing transforms
- [ ] All example transforms work correctly
