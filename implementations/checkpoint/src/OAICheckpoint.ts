import { ProvidersEvent, ServerEventsExtractor } from '@realtime-switch/core';
import { BaseCheckpoint } from './BaseCheckpoint';

export class OAICheckpoint extends BaseCheckpoint {
  constructor(accountId: string, sessionId: string, extractor: ServerEventsExtractor) {
    super(accountId, sessionId, extractor);
  }

  userTranscript(event: ProvidersEvent): void {
    const eventType = event.payload?.type;
    console.log(`[OAICheckpoint] userTranscript called with:`, { eventType, delta: event.payload?.delta });

    if (eventType === 'conversation.item.input_audio_transcription.delta') {
      const transcript = event.payload?.delta;
      if (transcript) {
        console.log(`[OAICheckpoint] Saving user transcript: ${transcript}`);
        this.save('user', transcript, event.src);
      } else {
        console.log('[OAICheckpoint] No delta found in user transcript event');
      }
    }
  }

  responseTranscript(event: ProvidersEvent): void {
    const eventType = event.payload?.type;

    if (eventType === 'response.audio_transcript.delta') {
      const transcript = event.payload?.delta;
      if (transcript) {
        this.save('agent', transcript, event.src);
      }
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