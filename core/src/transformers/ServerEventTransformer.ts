import { EventManager } from '../eventmanager/EventManager';
import { ProvidersEvent } from '../events/ProvidersEvent';
import { ServerEvents } from '../events/ServerEvents';
import { ServerEventsExtractor } from '../extractors/ServerEventsExtractor';

export abstract class ServerEventTransformer extends EventManager implements ServerEvents {
  protected extractor: ServerEventsExtractor | null;

  constructor(extractor: ServerEventsExtractor) {
    super();
    this.extractor = extractor;
    this.setupCallbacks();
  }

  private setupCallbacks(): void {
    if (!this.extractor) return;
    
    this.extractor.onUserTranscript((event: ProvidersEvent) => this.userTranscript(event));
    this.extractor.onResponseTranscript((event: ProvidersEvent) => this.responseTranscript(event));
    this.extractor.onResponseAudio((event: ProvidersEvent) => this.responseAudio(event));
    this.extractor.onToolCall((event: ProvidersEvent) => this.toolCall(event));
    this.extractor.onTurn((event: ProvidersEvent) => this.turn(event));
  }

  receiveEvent(event: ProvidersEvent): void {
    this.extractor?.extract(event);
  }

  abstract userTranscript(event: ProvidersEvent): void;
  abstract responseTranscript(event: ProvidersEvent): void;
  abstract responseAudio(event: ProvidersEvent): void;
  abstract toolCall(event: ProvidersEvent): void;
  abstract turn(event: ProvidersEvent): void;
  
  updateEventExtractor(extractor: ServerEventsExtractor): void {
    // Clean up old extractor first
    if (this.extractor) {
      this.extractor.cleanup();
    }
    
    this.extractor = extractor;
    this.setupCallbacks();
  }

  cleanup(): void {
    if (this.extractor) {
      this.extractor.cleanup();
      this.extractor = null;
    }
  }
}