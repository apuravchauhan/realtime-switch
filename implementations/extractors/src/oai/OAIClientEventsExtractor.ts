import { ClientEventsExtractor, ProvidersEvent } from '@realtime-switch/core';

export class OAIClientEventsExtractor implements ClientEventsExtractor {
  private userAudioCallback?: (event: ProvidersEvent) => void;
  private sessionUpdateCallback?: (event: ProvidersEvent) => void;
  private toolResponseCallback?: (event: ProvidersEvent) => void;

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
    // Extract and route OAI events to appropriate callbacks
    const payload = event.payload;

    if (payload.type === 'input_audio_buffer.append' && this.userAudioCallback) {
      this.userAudioCallback(event);
    } else if (payload.type === 'session.update' && this.sessionUpdateCallback) {
      this.sessionUpdateCallback(event);
    } else if (payload.type === 'conversation.item.create' && payload.item?.type === 'function_call_output' && this.toolResponseCallback) {
      this.toolResponseCallback(event);
    }
  }
}