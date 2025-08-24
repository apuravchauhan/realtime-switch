import { ProvidersEvent } from './ProvidersEvent';

export interface ServerEvents {
  userTranscript(event: ProvidersEvent): void;
  responseTranscript(event: ProvidersEvent): void;
  responseAudio(event: ProvidersEvent): void;
  toolCall(event: ProvidersEvent): void;
  turn(event: ProvidersEvent): void;
}