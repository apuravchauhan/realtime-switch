import { Checkpoint, ProvidersEvent, ServerEventsExtractor, Persistence, ConversationEntry } from '@realtime-switch/core';
import { FilePersistence } from './FilePersistence';

export abstract class BaseCheckpoint extends Checkpoint {
  protected sessionId: string;
  protected extractor: ServerEventsExtractor | null;
  protected persistence: Persistence;

  constructor(sessionId: string, extractor: ServerEventsExtractor, persistence?: Persistence) {
    super();
    this.sessionId = sessionId;
    this.extractor = extractor;
    this.persistence = persistence || new FilePersistence();
    this.setupCallbacks(extractor);
  }

  private setupCallbacks(extractor: ServerEventsExtractor): void {
    extractor.onUserTranscript((event) => this.userTranscript(event));
    extractor.onResponseTranscript((event) => this.responseTranscript(event));
    extractor.onResponseAudio((event) => this.responseAudio(event));
    extractor.onToolCall((event) => this.toolCall(event));
    extractor.onTurn((event) => this.turn(event));
  }


  receiveEvent(event: ProvidersEvent): void {
    this.extractor?.extract(event);
  }

  updateEventExtractor(extractor: ServerEventsExtractor): void {
    // Clean up old extractor first
    if (this.extractor) {
      this.extractor.cleanup();
    }
    
    this.extractor = extractor;
    this.setupCallbacks(extractor);
  }

  protected async save(type: ConversationEntry['type'], content: string, provider?: string): Promise<void> {
    // Format as simple text line for conversation log
    const line = `${type}:${content}\n`;
    
    await this.persistence.append('conversations', this.sessionId, line);
  }




  async createCheckpoint(reason?: string): Promise<void> {
    const checkpointContent = `Checkpoint: ${reason || 'Manual checkpoint'} - ${new Date().toISOString()}`;
    await this.save('agent_checkpoint', checkpointContent);
  }

  async loadFromFile(sessionId?: string): Promise<boolean> {
    // Not needed in simplified approach - conversation history loaded directly in loadConversationHistory()
    return true;
  }

  async cleanup(): Promise<void> {
    await this.persistence.cleanup();
    
    if (this.extractor) {
      this.extractor.cleanup();
      this.extractor = null;
    }
  }

  static async loadConversationHistory(sessionId: string, persistence?: Persistence): Promise<string | null> {
    try {
      const persistenceLayer = persistence || new FilePersistence();
      const content = await persistenceLayer.read('conversations', sessionId);
      
      return content ? content.trim() : null;
    } catch (error) {
      console.error('Error loading conversation history:', error);
      return null;
    }
  }
}