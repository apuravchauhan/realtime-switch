import { ProvidersEvent, ServerEventsExtractor } from '@realtime-switch/core';

export class GeminiServerEventsExtractor implements ServerEventsExtractor {
  private userTranscriptCallback?: (event: ProvidersEvent) => void;
  private responseTranscriptCallback?: (event: ProvidersEvent) => void;
  private responseAudioCallback?: (event: ProvidersEvent) => void;
  private toolCallCallback?: (event: ProvidersEvent) => void;
  private turnCallback?: (event: ProvidersEvent) => void;
  private internalStatsCallback?: (event: ProvidersEvent) => void;

  constructor() {
    // No callback initially - will be set later
  }

  onUserTranscript(callback: (event: ProvidersEvent) => void): void {
    this.userTranscriptCallback = callback;
  }

  onResponseTranscript(callback: (event: ProvidersEvent) => void): void {
    this.responseTranscriptCallback = callback;
  }

  onResponseAudio(callback: (event: ProvidersEvent) => void): void {
    this.responseAudioCallback = callback;
  }

  onToolCall(callback: (event: ProvidersEvent) => void): void {
    this.toolCallCallback = callback;
  }

  onTurn(callback: (event: ProvidersEvent) => void): void {
    this.turnCallback = callback;
  }

  onInternalStats(callback: (event: ProvidersEvent) => void): void {
    this.internalStatsCallback = callback;
  }

  cleanup(): void {
    this.userTranscriptCallback = undefined;
    this.responseTranscriptCallback = undefined;
    this.responseAudioCallback = undefined;
    this.toolCallCallback = undefined;
    this.turnCallback = undefined;
    this.internalStatsCallback = undefined;
  }

  extract(event: ProvidersEvent): void {
    const serverContent = event.payload?.serverContent;
    
    if (!event.payload) {
      console.warn('GeminiServerEventsExtractor: Received event without payload:', event);
      return;
    }

    // Check for setupComplete
    if (event.payload.setupComplete) {
      console.log('GeminiServerEventsExtractor: Setup complete');
      return;
    }

    // Check for serverContent events
    if (serverContent) {
      // User transcription
      if (serverContent.inputTranscription) {
        this.userTranscriptCallback?.(event);
        return;
      }

      // Agent audio (modelTurn with parts containing audio data)
      if (serverContent.modelTurn) {
        this.responseAudioCallback?.(event);
        return;
      }

      // Response transcription
      if (serverContent.outputTranscription) {
        this.responseTranscriptCallback?.(event);
        return;
      }

      // Turn completion - triggered by generationComplete or interrupted
      if (serverContent.generationComplete || serverContent.interrupted) {
        this.turnCallback?.(event);
        return;
      }
      // Handle turnComplete for usage data extraction - no longer needed since usage is recorded at provider level
      if (serverContent.turnComplete) {
        return; // Ignore for turn logic
      }
    }

    // Check for toolCall events (outside serverContent)
    if (event.payload.toolCall) {
      this.toolCallCallback?.(event);
      return;
    }


    console.log('GeminiServerEventsExtractor: Unhandled event structure:', JSON.stringify(event.payload, null, 2));
  }

}