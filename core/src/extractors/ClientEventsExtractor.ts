import { ProvidersEvent } from '../events/ProvidersEvent';

export interface ClientEventsExtractor {
  onUserAudio(callback: (event: ProvidersEvent) => void): void;
  onSessionUpdate(callback: (event: ProvidersEvent) => void): void;
  onToolResponse(callback: (event: ProvidersEvent) => void): void;
  cleanup(): void;
  extract(event: ProvidersEvent): void;
}