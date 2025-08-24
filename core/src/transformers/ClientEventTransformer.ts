import { EventManager } from '../eventmanager/EventManager';
import { ProvidersEvent } from '../events/ProvidersEvent';
import { ClientEvents } from '../events/ClientEvents';
import { ClientEventsExtractor } from '../extractors/ClientEventsExtractor';

export abstract class ClientEventTransformer extends EventManager implements ClientEvents {
  protected extractor: ClientEventsExtractor | null;

  constructor(extractor: ClientEventsExtractor) {
    super();
    this.extractor = extractor;
    this.setupCallbacks();
  }

  private setupCallbacks(): void {
    if (!this.extractor) return;
    
    this.extractor.onUserAudio((event: ProvidersEvent) => this.userAudio(event));
    this.extractor.onSessionUpdate((event: ProvidersEvent) => this.sessionUpdate(event));
    this.extractor.onToolResponse((event: ProvidersEvent) => this.toolResponse(event));
  }

  receiveEvent(event: ProvidersEvent): void {
    if (this.extractor) {
      this.extractor.extract(event);
    }
  }

  abstract userAudio(event: ProvidersEvent): void;
  abstract sessionUpdate(event: ProvidersEvent): void;
  abstract toolResponse(event: ProvidersEvent): void;
  
  updateEventExtractor(extractor: ClientEventsExtractor): void {
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