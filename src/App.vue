<script setup lang="ts">
import MultiPianoRollDemo from './components/pianoRoll/MultiPianoRollDemo.vue'
</script>

<template>
  <main class="page">
    <h1>LLM MIDI Mangler</h1>
    <div class="description">
      <p>
        This is an LLM powered MIDI mangling workbench. A central piano roll lets you manually write out MIDI, 
        and it is played back using <a href="https://tonejs.github.io/" target="_blank" rel="noreferrer">Tone.js</a>. 
        A chatbot powered by Claude Sonnet can read and write from the piano roll with tool calls. Additionally, 
        there is a workbench at the bottom of the page that lets you define custom functions for transforming 
        the piano roll. The chatbot can write new functions into specific slots, or can even call your functions 
        as tools (instead of generating raw MIDI as an LLM response). You can also manually apply your transformation functions with the controls under the text editor.
        <br/><br/>
        The source code for this is on <a href="https://github.com/AvneeshSarwate/pianoRollChatbot" target="_blank" rel="noreferrer">GitHub</a>.
      </p>
    </div>
    
    <MultiPianoRollDemo />
  </main>
</template>

<style scoped>
.description {
  background: linear-gradient(135deg, #f9fafb 0%, #ffffff 100%);
  border: 2px solid #4a6cf7;
  border-radius: 12px;
  padding: 24px 32px;
  margin: 24px 0;
  box-shadow: 0 8px 24px rgba(74, 108, 247, 0.15);
}

.description p {
  margin: 0;
  font-size: 1.05rem;
  line-height: 1.8;
  color: #303553;
}

.description a {
  color: #4a6cf7;
  font-weight: 600;
  text-decoration: none;
  border-bottom: 2px solid transparent;
  transition: border-color 0.2s ease;
}

.description a:hover {
  border-bottom-color: #4a6cf7;
}
</style>
