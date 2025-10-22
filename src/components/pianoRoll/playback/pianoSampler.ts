import * as Tone from 'tone'

const BASE = import.meta.env.BASE_URL + 'salamanderSamples/'
const LAYER = 10 // pick a middle velocity layer for now (v1..v16)

// Light mapping (saves load time). Add/remove notes as you like.
const NOTES = [
  'A0', 'C1', 'D#1', 'F#1',
  'A1', 'C2', 'D#2', 'F#2',
  'A2', 'C3', 'D#3', 'F#3',
  'A3', 'C4', 'D#4', 'F#4',
  'A4', 'C5', 'D#5', 'F#5',
  'A5', 'C6', 'D#6', 'F#6',
  'A6', 'C7', 'D#7', 'F#7',
  'A7', 'C8',
]

const urls = Object.fromEntries(
  NOTES.map((note) => [note, `${note.replace('#', '%23')}v${LAYER}.wav`])
)

export function createPianoSampler(): Tone.Sampler {
  console.log('Creating piano sampler with BASE:', BASE, 'urls:', urls)
  
  const sampler = new Tone.Sampler({
    urls,
    release: 1,
    baseUrl: BASE,
    onload: () => {
      console.log('Piano samples loaded successfully!')
    },
    onerror: (error) => {
      console.error('Error loading piano sample:', error)
    }
  }).toDestination()
  
  console.log('Sampler created, loaded state:', (sampler as any).loaded)
  
  return sampler
}
