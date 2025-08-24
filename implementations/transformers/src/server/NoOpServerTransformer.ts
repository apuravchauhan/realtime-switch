import { ServerEventTransformer, ProvidersEvent, ServerEventsExtractor } from '@realtime-switch/core';

export class NoOpServerTransformer extends ServerEventTransformer {
  constructor(extractor: ServerEventsExtractor) {
    super(extractor);
  }

  receiveEvent(event: ProvidersEvent): void {
    this.emitEvent(event);
  }

  userTranscript(event: ProvidersEvent): void {
    this.emitEvent(event);
  }

  responseTranscript(event: ProvidersEvent): void {
    this.emitEvent(event);
  }

  responseAudio(event: ProvidersEvent): void {
    this.emitEvent(event);
  }

  toolCall(event: ProvidersEvent): void {
    this.emitEvent(event);
  }

  turn(event: ProvidersEvent): void {
    this.emitEvent(event);
  }
}