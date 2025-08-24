import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import { Persistence } from '@realtime-switch/core';
import { PersistenceConfig } from '@realtime-switch/core';

export class FilePersistence implements Persistence {
  private basePath: string;

  constructor(config: PersistenceConfig = {}) {
    this.basePath = config.basePath || './';
  }

  async append(entity: string, sessionId: string, content: string): Promise<void> {
    const filePath = this.getFilePath(entity, sessionId);
    await this.ensureDirectoryExists(filePath);
    
    await fs.appendFile(filePath, content, 'utf-8');
  }

  async overwrite(entity: string, sessionId: string, content: string): Promise<void> {
    const filePath = this.getFilePath(entity, sessionId);
    await this.ensureDirectoryExists(filePath);
    
    await fs.writeFile(filePath, content, 'utf-8');
  }

  async read(entity: string, sessionId: string): Promise<string | null> {
    const filePath = this.getFilePath(entity, sessionId);
    
    try {
      return await fs.readFile(filePath, 'utf-8');
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  async delete(entity: string, sessionId: string): Promise<void> {
    const filePath = this.getFilePath(entity, sessionId);
    
    try {
      await fs.unlink(filePath);
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  async exists(entity: string, sessionId: string): Promise<boolean> {
    const filePath = this.getFilePath(entity, sessionId);
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

  private getFilePath(entity: string, sessionId: string): string {
    const entityDir = path.join(this.basePath, `.${entity}`);
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