import { Checkpoint, ProvidersEvent, ServerEventsExtractor, Persistence, ConversationEntry } from '@realtime-switch/core';
import { FilePersistence } from './FilePersistence';

export abstract class BaseCheckpoint extends Checkpoint {
  protected sessionId: string;
  protected extractor: ServerEventsExtractor | null;
  protected persistence: Persistence;

  // Buffering state for performance optimization
  private currentType: ConversationEntry['type'] | null = null;
  private currentContentBuffer: string[] = []; // Array buffer for efficient concatenation
  private currentContentLength: number = 0; // Track total length without joining
  private readonly BUFFER_SIZE_LIMIT = 200; // Characters

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
    // First entry or type change - add with type prefix
    if (this.currentType !== type) {
      // Add newline if not first entry
      const prefix = this.currentContentBuffer.length > 0 ? '\n' : '';
      this.currentContentBuffer.push(`${prefix}${type}:${content}`);
      this.currentType = type;
    } else {
      // Same type - just append content
      this.currentContentBuffer.push(content);
    }

    // Update length
    this.currentContentLength += content.length;

    // Check if buffer exceeds limit
    if (this.currentContentLength > this.BUFFER_SIZE_LIMIT) {
      await this.flushBuffer();
    }
  }

  /**
   * Flushes the current buffer to persistence
   */
  private async flushBuffer(): Promise<void> {
    if (this.currentContentBuffer.length > 0) {
      // Simply join all buffer content - newlines already included in the buffer
      const content = this.currentContentBuffer.join('');
      await this.persistence.append('conversations', this.sessionId, content);
    }

    // Reset buffer state
    this.currentType = null;
    this.currentContentBuffer = [];
    this.currentContentLength = 0;
  }

  /**
   * Public method to force flush remaining buffer (useful for cleanup)
   */
  public async flushPendingBuffer(): Promise<void> {
    await this.flushBuffer();
  }




  async createCheckpoint(reason?: string): Promise<void> {
    // Flush any pending buffer before creating checkpoint to ensure data integrity
    await this.flushPendingBuffer();

    const checkpointContent = `Checkpoint: ${reason || 'Manual checkpoint'} - ${new Date().toISOString()}`;
    await this.save('agent_checkpoint', checkpointContent);

    // Flush the checkpoint immediately since it's a significant event
    await this.flushPendingBuffer();
  }

  async loadFromFile(sessionId?: string): Promise<boolean> {
    // Not needed in simplified approach - conversation history loaded directly in loadConversationHistory()
    return true;
  }

  async cleanup(): Promise<void> {
    // Flush any remaining buffered content before cleanup
    await this.flushPendingBuffer();

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