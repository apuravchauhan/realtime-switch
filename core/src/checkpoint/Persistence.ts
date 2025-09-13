export interface Persistence {
  // Updated methods with accountId
  append(accountId: string, entity: string, sessionId: string, content: string): Promise<void>;
  overwrite(accountId: string, entity: string, sessionId: string, content: string): Promise<void>;
  read(accountId: string, entity: string, sessionId: string): Promise<string | null>;
  delete(accountId: string, entity: string, sessionId: string): Promise<void>;
  exists(accountId: string, entity: string, sessionId: string): Promise<boolean>;
  flush(): Promise<void>;
  cleanup(): Promise<void>;
  
  // Generic CRUD operations for usage tracking
  insert(table: string, data: Record<string, any>): Promise<void>;
  update(table: string, where: Record<string, any>, data: Record<string, any>): Promise<void>;
  readRecord(table: string, where: Record<string, any>): Promise<any>;
  deleteRecord(table: string, where: Record<string, any>): Promise<void>;
  usageSum(accountId: string, fromTime?: number, toTime?: number): Promise<{totalTokens: number} | null>;
}
