import { ProvidersEvent } from './ProvidersEvent';

export interface ClientEvents {
  userAudio(event: ProvidersEvent): void;
  sessionUpdate(event: ProvidersEvent): void;
  toolResponse(event: ProvidersEvent): void;
}