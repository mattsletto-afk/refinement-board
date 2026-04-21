import type { RunScoreEvent } from './scoreEventTypes'

type Listener = (event: RunScoreEvent) => void

class ScoreEventChannel {
  private listeners: Set<Listener> = new Set()

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  publish(event: RunScoreEvent): void {
    for (const listener of this.listeners) {
      listener(event)
    }
  }

  listenerCount(): number {
    return this.listeners.size
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __scoreEventChannel: ScoreEventChannel | undefined
}

if (!global.__scoreEventChannel) {
  global.__scoreEventChannel = new ScoreEventChannel()
}

export const scoreEventChannel: ScoreEventChannel = global.__scoreEventChannel
