import { Persistence } from '@realtime-switch/core';
import { SecureIPCClient, MessageType } from './ipc/SecureIPCClient';

/**
 * SQLite Persistence implementation using secure native IPC
 * Uses native Unix sockets for communication with database server
 * 
 * Singleton pattern to prevent multiple IPC connections per process.
 * Use getInstance() instead of constructor.
 */
export class SQLitePersistence implements Persistence {
  private static instance: SQLitePersistence | null = null;
  private client: SecureIPCClient;

  private constructor(socketPath: string = '/tmp/realtime-switch-db.sock') {
    this.client = new SecureIPCClient({
      socketPath,
      reconnectInterval: 1000,
      maxReconnectAttempts: 10,
      requestTimeout: 10000
    });

    this.setupEventHandlers();
  }

  /**
   * Get singleton instance of SQLitePersistence
   * @param socketPath - Path to Unix socket (only used on first call)
   * @returns Singleton instance
   */
  static getInstance(socketPath: string = '/tmp/realtime-switch-db.sock'): SQLitePersistence {
    if (!this.instance) {
      this.instance = new SQLitePersistence(socketPath);
      console.log('[SQLitePersistence] Singleton instance created');
    }
    return this.instance;
  }

  private setupEventHandlers(): void {
    this.client.on('connect', () => {
      console.log('[SQLitePersistence] Connected to database server');
    });

    this.client.on('disconnect', () => {
      console.log('[SQLitePersistence] Disconnected from database server');
    });

    this.client.on('error', (error: Error) => {
      console.error('[SQLitePersistence] Client error:', error);
    });

    this.client.on('maxReconnectAttemptsReached', () => {
      console.error('[SQLitePersistence] Max reconnection attempts reached');
    });
  }

  /**
   * Append content to a session
   */
  async append(entity: string, sessionId: string, content: string): Promise<void> {
    try {
      const response = await this.client.sendMessage({
        type: MessageType.APPEND,
        category: entity,
        key: sessionId,
        content
      });

      if (!response.success) {
        throw new Error(response.error || 'Append operation failed');
      }
    } catch (error) {
      console.error(`[SQLitePersistence] Append failed for ${entity}:${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Overwrite content for a session
   */
  async overwrite(entity: string, sessionId: string, content: string): Promise<void> {
    try {
      const response = await this.client.sendMessage({
        type: MessageType.OVERWRITE,
        category: entity,
        key: sessionId,
        content
      });

      if (!response.success) {
        throw new Error(response.error || 'Overwrite operation failed');
      }
    } catch (error) {
      console.error(`[SQLitePersistence] Overwrite failed for ${entity}:${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Read content from a session
   */
  async read(entity: string, sessionId: string): Promise<string | null> {
    try {
      const response = await this.client.sendMessage({
        type: MessageType.READ,
        category: entity,
        key: sessionId
      });

      if (!response.success) {
        if (response.error?.includes('not found') || response.data === null) {
          return null;
        }
        throw new Error(response.error || 'Read operation failed');
      }

      return response.data || null;
    } catch (error) {
      console.error(`[SQLitePersistence] Read failed for ${entity}:${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Delete a session
   */
  async delete(entity: string, sessionId: string): Promise<void> {
    try {
      const response = await this.client.sendMessage({
        type: MessageType.DELETE,
        category: entity,
        key: sessionId
      });

      if (!response.success) {
        throw new Error(response.error || 'Delete operation failed');
      }
    } catch (error) {
      console.error(`[SQLitePersistence] Delete failed for ${entity}:${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Check if a session exists
   */
  async exists(entity: string, sessionId: string): Promise<boolean> {
    try {
      const response = await this.client.sendMessage({
        type: MessageType.EXISTS,
        category: entity,
        key: sessionId
      });

      if (!response.success) {
        throw new Error(response.error || 'Exists check failed');
      }

      return Boolean(response.data);
    } catch (error) {
      console.error(`[SQLitePersistence] Exists check failed for ${entity}:${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Force flush/checkpoint - empty as data is out of our control
   */
  async flush(): Promise<void> {
    // No-op: Litestream manages checkpoints automatically
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    try {
      await this.client.disconnect();
      console.log('[SQLitePersistence] Client disconnected cleanly');
    } catch (error) {
      console.error('[SQLitePersistence] Cleanup error:', error);
    }
  }

  /**
   * Shutdown singleton instance and cleanup resources
   * Call this for graceful application shutdown
   */
  static async shutdown(): Promise<void> {
    if (this.instance) {
      console.log('[SQLitePersistence] Shutting down singleton instance');
      await this.instance.cleanup();
      this.instance = null;
    }
  }

  /**
   * Reset singleton instance (primarily for testing)
   * WARNING: Only use this in tests or when you're sure no other code is using the instance
   */
  static resetInstance(): void {
    this.instance = null;
  }

}