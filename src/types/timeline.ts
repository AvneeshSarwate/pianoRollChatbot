export interface TimelineNote {
  id: string
  pitch: number
  position: number
  duration: number
  velocity?: number
}

export interface TimelineGrid {
  maxLength: number
  timeSignature: number
  subdivision: number
}

export interface TimelineState {
  notes: TimelineNote[]
  playheadPosition: number
  queuePosition: number
  grid: TimelineGrid
}
