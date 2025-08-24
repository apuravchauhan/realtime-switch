import { ProvidersEvent } from '../events/ProvidersEvent';

export interface ServerEventsExtractor {
  onUserTranscript(callback: (event: ProvidersEvent) => void): void;
  onResponseTranscript(callback: (event: ProvidersEvent) => void): void;
  onResponseAudio(callback: (event: ProvidersEvent) => void): void;
  onToolCall(callback: (event: ProvidersEvent) => void): void;
  onTurn(callback: (event: ProvidersEvent) => void): void;
  cleanup(): void;
  extract(event: ProvidersEvent): void;
}