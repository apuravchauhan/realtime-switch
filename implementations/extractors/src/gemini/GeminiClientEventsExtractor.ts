import { ClientEventsExtractor, ProvidersEvent } from '@realtime-switch/core';

export class GeminiClientEventsExtractor implements ClientEventsExtractor {
  private userAudioCallback?: (event: ProvidersEvent) => void;
  private sessionUpdateCallback?: (event: ProvidersEvent) => void;
  private toolResponseCallback?: (event: ProvidersEvent) => void;

  constructor() {
    // Individual callbacks will be set later
  }

  onUserAudio(callback: (event: ProvidersEvent) => void): void {
    this.userAudioCallback = callback;
  }

  onSessionUpdate(callback: (event: ProvidersEvent) => void): void {
    this.sessionUpdateCallback = callback;
  }

  onToolResponse(callback: (event: ProvidersEvent) => void): void {
    this.toolResponseCallback = callback;
  }

  cleanup(): void {
    this.userAudioCallback = undefined;
    this.sessionUpdateCallback = undefined;
    this.toolResponseCallback = undefined;
  }

  extract(event: ProvidersEvent): void {
    // Extract and route Gemini events to appropriate callbacks
    const payload = event.payload;
    
    // Check for Gemini audio format (realtimeInput) 
    if (payload.realtimeInput && this.userAudioCallback) {
      this.userAudioCallback(event);
    } else if (payload.setup && this.sessionUpdateCallback) {
      this.sessionUpdateCallback(event);
    } else if (payload.toolResponse && this.toolResponseCallback) {
      this.toolResponseCallback(event);
    }
  }
}