import { Persistence, Logger } from '@realtime-switch/core';
import { SecureIPCClient, MessageType } from './ipc/SecureIPCClient';

const CLASS_NAME = 'SQLitePersistence';

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
      Logger.debug(CLASS_NAME, null, 'Singleton instance created');
    }
    return this.instance;
  }

  private setupEventHandlers(): void {
    this.client.on('connect', () => {
      Logger.debug(CLASS_NAME, null, 'Connected to database server');
    });

    this.client.on('disconnect', () => {
      Logger.debug(CLASS_NAME, null, 'Disconnected from database server');
    });

    this.client.on('error', (error: Error) => {
      Logger.error(CLASS_NAME, null, 'Client error', error);
    });

    this.client.on('maxReconnectAttemptsReached', () => {
      Logger.error(CLASS_NAME, null, 'Max reconnection attempts reached', new Error('Max reconnection attempts reached'));
    });
  }

  /**
   * Append content to a session
   */
  async append(accountId: string, entity: string, sessionId: string, content: string): Promise<void> {
    try {
      const response = await this.client.sendMessage({
        type: MessageType.APPEND,
        category: entity,
        key: sessionId,
        content,
        data: { accountId }
      });

      if (!response.success) {
        throw new Error(response.error || 'Append operation failed');
      }
    } catch (error) {
      Logger.error(CLASS_NAME, null, 'Append failed for {}:{}', error as Error, entity, sessionId);
      throw error;
    }
  }

  /**
   * Overwrite content for a session
   */
  async overwrite(accountId: string, entity: string, sessionId: string, content: string): Promise<void> {
    try {
      const response = await this.client.sendMessage({
        type: MessageType.OVERWRITE,
        category: entity,
        key: sessionId,
        content,
        data: { accountId }
      });

      if (!response.success) {
        throw new Error(response.error || 'Overwrite operation failed');
      }
    } catch (error) {
      Logger.error(CLASS_NAME, null, 'Overwrite failed for {}:{}', error as Error, entity, sessionId);
      throw error;
    }
  }

  /**
   * Read content from a session
   */
  async read(accountId: string, entity: string, sessionId: string): Promise<string | null> {
    try {
      const response = await this.client.sendMessage({
        type: MessageType.READ,
        category: entity,
        key: sessionId,
        data: { accountId }
      });

      if (!response.success) {
        if (response.error?.includes('not found') || response.data === null) {
          return null;
        }
        throw new Error(response.error || 'Read operation failed');
      }

      return response.data || null;
    } catch (error) {
      Logger.error(CLASS_NAME, null, 'Read failed for {}:{}', error as Error, entity, sessionId);
      throw error;
    }
  }

  /**
   * Delete a session
   */
  async delete(accountId: string, entity: string, sessionId: string): Promise<void> {
    try {
      const response = await this.client.sendMessage({
        type: MessageType.DELETE,
        category: entity,
        key: sessionId,
        data: { accountId }
      });

      if (!response.success) {
        throw new Error(response.error || 'Delete operation failed');
      }
    } catch (error) {
      Logger.error(CLASS_NAME, null, 'Delete failed for {}:{}', error as Error, entity, sessionId);
      throw error;
    }
  }

  /**
   * Check if a session exists
   */
  async exists(accountId: string, entity: string, sessionId: string): Promise<boolean> {
    try {
      const response = await this.client.sendMessage({
        type: MessageType.EXISTS,
        category: entity,
        key: sessionId,
        data: { accountId }
      });

      if (!response.success) {
        throw new Error(response.error || 'Exists check failed');
      }

      return Boolean(response.data);
    } catch (error) {
      Logger.error(CLASS_NAME, null, 'Exists check failed for {}:{}', error as Error, entity, sessionId);
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
      Logger.debug(CLASS_NAME, null, 'Client disconnected cleanly');
    } catch (error) {
      Logger.error(CLASS_NAME, null, 'Cleanup error', error as Error);
    }
  }

  /**
   * Shutdown singleton instance and cleanup resources
   * Call this for graceful application shutdown
   */
  static async shutdown(): Promise<void> {
    if (this.instance) {
      Logger.debug(CLASS_NAME, null, 'Shutting down singleton instance');
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

  // Generic CRUD operations for usage tracking
  async insert(table: string, data: Record<string, any>): Promise<void> {
    try {
      const response = await this.client.sendMessage({
        type: MessageType.INSERT_USAGE,
        table,
        data
      });

      if (!response.success) {
        throw new Error(response.error || 'Insert operation failed');
      }
    } catch (error) {
      Logger.error(CLASS_NAME, null, 'Insert failed for table {}', error as Error, table);
      throw error;
    }
  }

  async update(table: string, where: Record<string, any>, data: Record<string, any>): Promise<void> {
    try {
      const response = await this.client.sendMessage({
        type: MessageType.UPDATE_USAGE,
        table,
        where,
        data
      });

      if (!response.success) {
        throw new Error(response.error || 'Update operation failed');
      }
    } catch (error) {
      Logger.error(CLASS_NAME, null, 'Update failed for table {}', error as Error, table);
      throw error;
    }
  }

  async readRecord(table: string, where: Record<string, any>): Promise<any> {
    try {
      const response = await this.client.sendMessage({
        type: MessageType.READ_USAGE,
        table,
        where
      });

      if (!response.success) {
        if (response.error?.includes('not found') || response.data === null) {
          return null;
        }
        throw new Error(response.error || 'Read operation failed');
      }

      return response.data || null;
    } catch (error) {
      Logger.error(CLASS_NAME, null, 'ReadRecord failed for table {}', error as Error, table);
      throw error;
    }
  }

  async deleteRecord(table: string, where: Record<string, any>): Promise<void> {
    try {
      const response = await this.client.sendMessage({
        type: MessageType.DELETE,
        table,
        where
      });

      if (!response.success) {
        throw new Error(response.error || 'Delete operation failed');
      }
    } catch (error) {
      Logger.error(CLASS_NAME, null, 'DeleteRecord failed for table {}', error as Error, table);
      throw error;
    }
  }

  async usageSum(accountId: string, fromTime?: number, toTime?: number): Promise<{totalTokens: number} | null> {
    try {
      const whereClause: Record<string, any> = { account_id: accountId };
      
      if (fromTime) whereClause.created_at_gte = fromTime;
      if (toTime) whereClause.created_at_lte = toTime;
      
      const response = await this.client.sendMessage({
        type: MessageType.READ_USAGE,
        table: 'usage_metrics_sum',
        where: whereClause
      });

      if (!response.success) {
        if (response.error?.includes('not found') || response.data === null) {
          return { totalTokens: 0 };
        }
        throw new Error(response.error || 'Usage sum operation failed');
      }

      return response.data ? { totalTokens: response.data.total_tokens_sum || 0 } : { totalTokens: 0 };
    } catch (error) {
      Logger.error(CLASS_NAME, null, 'UsageSum failed for account {}', error as Error, accountId);
      return null;
    }
  }

}