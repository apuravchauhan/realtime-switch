import { Checkpoint, ProvidersEvent, ServerEventsExtractor, Persistence, ConversationEntry, Config, ConfigKeys } from '@realtime-switch/core';
import { FilePersistence } from './FilePersistence';
import { SQLitePersistence } from './SQLitePersistence';

export abstract class BaseCheckpoint extends Checkpoint {
  protected accountId: string;
  protected sessionId: string;
  protected extractor: ServerEventsExtractor | null;
  protected persistence: Persistence;

  // Buffering state for performance optimization
  private currentType: ConversationEntry['type'] | null = null;
  private currentContentBuffer: string[] = []; // Array buffer for efficient concatenation
  private currentContentLength: number = 0; // Track total length without joining
  private readonly BUFFER_SIZE_LIMIT = 200; // Characters

  constructor(accountId: string, sessionId: string, extractor: ServerEventsExtractor, persistence?: Persistence) {
    super();
    this.accountId = accountId;
    this.sessionId = sessionId;
    this.extractor = extractor;
    this.persistence = persistence || BaseCheckpoint.getPersistence();
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
      this.flushBuffer().catch(error => {
        console.error('[BaseCheckpoint] Background flush failed:', error);
      });
    }
  }

  /**
   * Flushes the current buffer to persistence (non-blocking)
   */
  private async flushBuffer(): Promise<void> {
    if (this.currentContentBuffer.length > 0) {
      // Simply join all buffer content - newlines already included in the buffer
      const content = this.currentContentBuffer.join('');

      // Make persistence non-blocking - fire and forget
      this.persistence.append(this.accountId, 'conversations', this.sessionId, content)
        .catch(error => {
          console.error('[BaseCheckpoint] Background persistence failed:', error);
        });
    }

    // Reset buffer state immediately (don't wait for persistence)
    this.currentType = null;
    this.currentContentBuffer = [];
    this.currentContentLength = 0;
  }

  /**
   * Public method to force flush remaining buffer (useful for cleanup) - non-blocking
   */
  public flushPendingBuffer(): void {
    this.flushBuffer().catch(error => {
      console.error('[BaseCheckpoint] Background flush failed:', error);
    });
  }




  createCheckpoint(reason?: string): void {
    // Flush any pending buffer before creating checkpoint to ensure data integrity (non-blocking)
    this.flushPendingBuffer();

    const checkpointContent = `Checkpoint: ${reason || 'Manual checkpoint'} - ${new Date().toISOString()}`;

    // Make checkpoint save non-blocking
    this.save('agent_checkpoint', checkpointContent).catch(error => {
      console.error('[BaseCheckpoint] Checkpoint save failed:', error);
    });

    // Flush the checkpoint immediately since it's a significant event (non-blocking)
    this.flushPendingBuffer();
  }

  async loadFromFile(sessionId?: string): Promise<boolean> {
    // Not needed in simplified approach - conversation history loaded directly in loadConversationHistory()
    return true;
  }

  async cleanup(): Promise<void> {
    console.log(`[BaseCheckpoint] Cleaning up session: ${this.sessionId}`);

    // Flush any remaining buffered content before cleanup (non-blocking for final cleanup)
    this.flushPendingBuffer();

    // ✅ CRITICAL FIX: Don't cleanup singleton persistence per session
    // Only cleanup persistence if it's NOT a singleton (e.g., FilePersistence)
    if (this.persistence.constructor.name === 'FilePersistence') {
      try {
        await this.persistence.cleanup();
        console.log(`[BaseCheckpoint] FilePersistence cleaned up for session: ${this.sessionId}`);
      } catch (error) {
        console.error(`[BaseCheckpoint] FilePersistence cleanup failed for session: ${this.sessionId}:`, error);
      }
    }
    // SQLitePersistence singleton is shared - don't cleanup per session

    if (this.extractor) {
      this.extractor.cleanup();
      this.extractor = null;
      console.log(`[BaseCheckpoint] Extractor cleaned up for session: ${this.sessionId}`);
    }

    console.log(`[BaseCheckpoint] Cleanup completed for session: ${this.sessionId}`);
  }

  // Usage tracking methods
  protected async recordUsage(provider: string, inputTokens: number, outputTokens: number, totalTokens: number): Promise<void> {
    try {
      const usageData = {
        account_id: this.accountId,
        session_id: this.sessionId,
        provider: provider,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: totalTokens,
        audio_duration_ms: 0
      };

      // Simple insert - one record per turn/response
      await this.persistence.insert('usage_metrics', usageData);
      
    } catch (error) {
      console.error(`[BaseCheckpoint] Failed to record usage for ${this.accountId}/${this.sessionId}:`, error);
    }
  }

  // Usage aggregation method
  async getUsageSum(accountId: string, fromTime?: number, toTime?: number): Promise<{totalTokens: number} | null> {
    try {
      return await this.persistence.usageSum(accountId, fromTime, toTime);
    } catch (error) {
      console.error(`[BaseCheckpoint] Failed to get usage sum for ${accountId}:`, error);
      return null;
    }
  }

  static getPersistence(): Persistence {
    const config = Config.getInstance();
    const persistenceType = config.get(ConfigKeys.PERSISTENCE) || 'FILE';

    switch (persistenceType.toUpperCase()) {
      case 'SQLITE':
        return SQLitePersistence.getInstance();
      case 'FILE':
      default:
        return new FilePersistence({ basePath: './' });
    }
  }
  static async loadConversationHistory(accountId: string, sessionId: string, persistence?: Persistence): Promise<string | null> {
    try {
      const persistenceLayer = persistence || BaseCheckpoint.getPersistence();
      const content = await persistenceLayer.read(accountId, 'conversations', sessionId);

      return content ? content.trim() : null;
    } catch (error) {
      console.error('Error loading conversation history:', error);
      return null;
    }
  }
}