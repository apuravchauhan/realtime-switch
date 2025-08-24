import { ProvidersEvent, ServerEventsExtractor } from '@realtime-switch/core';

export class OAIServerEventsExtractor implements ServerEventsExtractor {
  private userTranscriptCallback?: (event: ProvidersEvent) => void;
  private responseTranscriptCallback?: (event: ProvidersEvent) => void;
  private responseAudioCallback?: (event: ProvidersEvent) => void;
  private toolCallCallback?: (event: ProvidersEvent) => void;
  private turnCallback?: (event: ProvidersEvent) => void;

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

  cleanup(): void {
    this.userTranscriptCallback = undefined;
    this.responseTranscriptCallback = undefined;
    this.responseAudioCallback = undefined;
    this.toolCallCallback = undefined;
    this.turnCallback = undefined;
  }

  extract(event: ProvidersEvent): void {
    const eventType = event.payload?.type as string;
    if (!eventType) {
      console.warn('OAIServerEventsExtractor: Received event without type:', event);
      return;
    }


    switch (eventType) {
      case 'conversation.item.input_audio_transcription.delta':
        this.userTranscriptCallback?.(event);
        break;

      case 'response.audio_transcript.delta':
        this.responseTranscriptCallback?.(event);
        break;

      case 'response.audio.delta':
        this.responseAudioCallback?.(event);
        break;

      case 'response.output_item.done':
        // Check if this is a function_call
        if (event.payload?.item?.type === 'function_call') {
          this.toolCallCallback?.(event);
        }
        break;

      case 'response.done':
        this.turnCallback?.(event);
        break;

      default:
        break;
    }
  }

}