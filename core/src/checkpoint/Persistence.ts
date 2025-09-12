export interface Persistence {
  append(entity: string, sessionId: string, content: string): Promise<void>;
  overwrite(entity: string, sessionId: string, content: string): Promise<void>;
  read(entity: string, sessionId: string): Promise<string | null>;
  delete(entity: string, sessionId: string): Promise<void>;
  exists(entity: string, sessionId: string): Promise<boolean>;
  flush(): Promise<void>;
  cleanup(): Promise<void>;
}
