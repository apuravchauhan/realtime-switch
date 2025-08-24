import { EventManager } from '../eventmanager/EventManager';
import { ProvidersEvent } from '../events/ProvidersEvent';
import { ServerEvents } from '../events/ServerEvents';
import { ServerEventsExtractor } from '../extractors/ServerEventsExtractor';

export abstract class Checkpoint extends EventManager implements ServerEvents {
  abstract updateEventExtractor(extractor: ServerEventsExtractor): void
  abstract userTranscript(event: ProvidersEvent): void
  abstract responseTranscript(event: ProvidersEvent): void
  abstract responseAudio(event: ProvidersEvent): void
  abstract toolCall(event: ProvidersEvent): void
  abstract turn(event: ProvidersEvent): void
}