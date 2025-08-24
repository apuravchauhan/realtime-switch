import { ClientEventTransformer, ProvidersEvent } from '@realtime-switch/core';

export class NoOpClientTransformer extends ClientEventTransformer {
  receiveEvent(event: ProvidersEvent): void {
    // Call parent to trigger extractor (which calls sessionUpdate, userAudio, etc.)
    super.receiveEvent(event);
  }

  userAudio(event: ProvidersEvent): void {
    this.emitEvent(event);
  }

  sessionUpdate(event: ProvidersEvent): void {
    this.emitEvent(event);
  }

  toolResponse(event: ProvidersEvent): void {
    this.emitEvent(event);
  }
}