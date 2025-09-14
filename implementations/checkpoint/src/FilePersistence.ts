import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import { Persistence, Logger } from '@realtime-switch/core';
import { PersistenceConfig } from '@realtime-switch/core';

const CLASS_NAME = 'FilePersistence';

export class FilePersistence implements Persistence {
  private basePath: string;

  constructor(config: PersistenceConfig = {}) {
    this.basePath = config.basePath || './';
  }

  async append(accountId: string, entity: string, sessionId: string, content: string): Promise<void> {
    const filePath = this.getFilePath(accountId, entity, sessionId);
    await this.ensureDirectoryExists(filePath);
    
    fs.appendFile(filePath, content, 'utf-8').catch(error => {
      Logger.error(CLASS_NAME, null, 'Append failed for {}/{}', error as Error, entity, sessionId);
    });
  }

  async overwrite(accountId: string, entity: string, sessionId: string, content: string): Promise<void> {
    const filePath = this.getFilePath(accountId, entity, sessionId);
    await this.ensureDirectoryExists(filePath);
    
    fs.writeFile(filePath, content, 'utf-8').catch(error => {
      Logger.error(CLASS_NAME, null, 'Overwrite failed for {}/{}', error as Error, entity, sessionId);
    });
  }

  async read(accountId: string, entity: string, sessionId: string): Promise<string | null> {
    const filePath = this.getFilePath(accountId, entity, sessionId);
    
    try {
      return await fs.readFile(filePath, 'utf-8');
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  async delete(accountId: string, entity: string, sessionId: string): Promise<void> {
    const filePath = this.getFilePath(accountId, entity, sessionId);
    
    fs.unlink(filePath).catch(error => {
      if (error.code !== 'ENOENT') { // Ignore "file not found" errors
        Logger.error(CLASS_NAME, null, 'Delete failed for {}/{}', error as Error, entity, sessionId);
      }
    });
  }

  async exists(accountId: string, entity: string, sessionId: string): Promise<boolean> {
    const filePath = this.getFilePath(accountId, entity, sessionId);
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async flush(): Promise<void> {
    // No buffering, so nothing to flush
  }

  async cleanup(): Promise<void> {
    // No buffering, so nothing to cleanup
  }

  // Generic CRUD operations - Not implemented for file-based storage
  async insert(table: string, data: Record<string, any>): Promise<void> {
    Logger.warn(CLASS_NAME, null, 'Generic insert not supported for table: {}. Use SQLitePersistence for usage tracking.', table);
  }

  async update(table: string, where: Record<string, any>, data: Record<string, any>): Promise<void> {
    Logger.warn(CLASS_NAME, null, 'Generic update not supported for table: {}. Use SQLitePersistence for usage tracking.', table);
  }

  async readRecord(table: string, where: Record<string, any>): Promise<any> {
    Logger.warn(CLASS_NAME, null, 'Generic readRecord not supported for table: {}. Use SQLitePersistence for usage tracking.', table);
    return null;
  }

  async deleteRecord(table: string, where: Record<string, any>): Promise<void> {
    Logger.warn(CLASS_NAME, null, 'Generic deleteRecord not supported for table: {}. Use SQLitePersistence for usage tracking.', table);
  }

  async usageSum(accountId: string, fromTime?: number, toTime?: number): Promise<{totalTokens: number} | null> {
    Logger.warn(CLASS_NAME, null, `Usage aggregation not supported. Use SQLitePersistence for usage tracking.`);
    return null;
  }

  private getFilePath(accountId: string, entity: string, sessionId: string): string {
    const entityDir = path.join(this.basePath, accountId, `.${entity}`);
    const fileName = entity === 'sessions' ? 
      `session-${sessionId}.json` : 
      `conversation-session-${sessionId}.txt`;
    
    return path.join(entityDir, fileName);
  }

  private async ensureDirectoryExists(filePath: string): Promise<void> {
    const dir = path.dirname(filePath);
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch (error: any) {
      if (error.code !== 'EEXIST') {
        throw error;
      }
    }
  }
}