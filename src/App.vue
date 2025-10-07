<script setup lang="ts">
import PianoRollDemo from './components/PianoRollDemo.vue'
</script>

<template>
  <main class="page">
    <h1>Piano Roll Component Integration Demo</h1>
    <p class="instructions">
      This demo uses the in-repo Vue piano roll component directly. The playback controls wire up
      <a href="https://tonejs.github.io/" target="_blank" rel="noreferrer">Tone.js</a>
      for scheduling and the live data is mirrored into a p5.js sketch for custom visualization.
    </p>
    <PianoRollDemo />
  </main>
</template>
