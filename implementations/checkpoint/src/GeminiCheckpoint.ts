import { ProvidersEvent, ServerEventsExtractor } from '@realtime-switch/core';
import { BaseCheckpoint } from './BaseCheckpoint';

export class GeminiCheckpoint extends BaseCheckpoint {
  constructor(accountId: string, sessionId: string, extractor: ServerEventsExtractor) {
    super(accountId, sessionId, extractor);
  }

  userTranscript(event: ProvidersEvent): void {
    const serverContent = event.payload?.serverContent;

    if (serverContent?.inputTranscription?.text) {
      const transcript = serverContent.inputTranscription.text;
      this.save('user', transcript, event.src);
    }
  }

  responseTranscript(event: ProvidersEvent): void {
    const serverContent = event.payload?.serverContent;

    if (serverContent?.outputTranscription?.text) {
      const transcript = serverContent.outputTranscription.text;
      this.save('agent', transcript, event.src);
    }
  }

  responseAudio(event: ProvidersEvent): void {
    //skip
  }

  toolCall(event: ProvidersEvent): void {
    //skip
  }

  turn(event: ProvidersEvent): void {
    // Turn events not saved to conversation history
  }

}