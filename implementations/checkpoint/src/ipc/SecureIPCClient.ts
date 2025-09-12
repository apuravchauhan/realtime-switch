import * as net from 'net';
import { EventEmitter } from 'events';

// IPC Message Types  
export enum MessageType {
  // Database Operations
  APPEND = 'APPEND',
  READ = 'READ',
  DELETE = 'DELETE',
  LIST = 'LIST',
  EXISTS = 'EXISTS',
  CLEANUP = 'CLEANUP',
  OVERWRITE = 'OVERWRITE',
  
  // Response Types
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR',
  DATA = 'DATA',
  
  // Connection Management
  PING = 'PING',
  PONG = 'PONG',
  READY = 'READY'
}

export interface IPCMessage {
  id: string;
  type: MessageType;
  category?: string;
  key?: string;
  content?: string;
  timestamp: number;
}

export interface IPCResponse {
  id: string;
  type: MessageType;
  success: boolean;
  data?: any;
  error?: string;
  timestamp: number;
}

export interface SecureIPCClientConfig {
  socketPath: string;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  requestTimeout?: number;
  maxMessageSize?: number;
}

/**
 * Secure IPC Client for communicating with realtime-switch-db server
 * Uses native Node.js net module for Unix socket communication
 */
export class SecureIPCClient extends EventEmitter {
  private socket: net.Socket | null = null;
  private config: SecureIPCClientConfig;
  private connected = false;
  private connecting = false;
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  
  // Message handling
  private pendingRequests = new Map<string, {
    resolve: (response: IPCResponse) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }>();
  
  private messageBuffer = '';

  constructor(config: SecureIPCClientConfig) {
    super();
    this.config = {
      reconnectInterval: 1000,
      maxReconnectAttempts: 10,
      requestTimeout: 10000,
      maxMessageSize: 1024 * 1024, // 1MB
      ...config
    };
  }

  /**
   * Connect to the IPC server
   */
  async connect(): Promise<void> {
    if (this.connected || this.connecting) {
      return;
    }

    return new Promise((resolve, reject) => {
      this.connecting = true;
      
      this.socket = new net.Socket();
      this.setupSocketEvents();

      const connectTimeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
        this.socket?.destroy();
      }, 5000);

      this.socket.connect(this.config.socketPath, () => {
        clearTimeout(connectTimeout);
        this.connected = true;
        this.connecting = false;
        this.reconnectAttempts = 0;
        
        console.log('[SecureIPCClient] Connected to server');
        this.emit('connect');
        resolve();
      });

      this.socket.on('error', (error) => {
        clearTimeout(connectTimeout);
        this.connecting = false;
        
        if (!this.connected) {
          reject(error);
        }
      });
    });
  }

  private setupSocketEvents(): void {
    if (!this.socket) return;

    this.socket.setNoDelay(true);

    this.socket.on('data', (data) => {
      try {
        this.messageBuffer += data.toString();
        
        // Process complete messages (delimited by newlines)
        let newlineIndex;
        while ((newlineIndex = this.messageBuffer.indexOf('\n')) !== -1) {
          const messageStr = this.messageBuffer.slice(0, newlineIndex);
          this.messageBuffer = this.messageBuffer.slice(newlineIndex + 1);
          
          if (messageStr.trim()) {
            this.processResponse(messageStr);
          }
        }
        
        // Prevent buffer overflow
        if (this.messageBuffer.length > this.config.maxMessageSize!) {
          console.error('[SecureIPCClient] Message buffer too large');
          this.handleDisconnect();
        }
      } catch (error) {
        console.error('[SecureIPCClient] Error processing data:', error);
        this.emit('error', error);
      }
    });

    this.socket.on('error', (error) => {
      console.error('[SecureIPCClient] Socket error:', error);
      this.emit('error', error);
      this.handleDisconnect();
    });

    this.socket.on('close', () => {
      console.log('[SecureIPCClient] Connection closed');
      this.handleDisconnect();
    });

    this.socket.on('end', () => {
      console.log('[SecureIPCClient] Server ended connection');
      this.handleDisconnect();
    });
  }

  private processResponse(messageStr: string): void {
    try {
      const response: IPCResponse = JSON.parse(messageStr);
      
      if (!this.isValidResponse(response)) {
        console.error('[SecureIPCClient] Invalid response format:', messageStr);
        return;
      }

      // Handle server ready signal
      if (response.type === MessageType.READY) {
        this.emit('ready');
        return;
      }

      // Handle pending request
      const pending = this.pendingRequests.get(response.id);
      if (pending) {
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(response.id);
        pending.resolve(response);
      } else {
        // Unsolicited response or broadcast
        this.emit('message', response);
      }
      
    } catch (error) {
      console.error('[SecureIPCClient] Error parsing response:', error);
    }
  }

  private isValidResponse(response: any): response is IPCResponse {
    return (
      typeof response === 'object' &&
      typeof response.id === 'string' &&
      typeof response.type === 'string' &&
      typeof response.success === 'boolean' &&
      typeof response.timestamp === 'number'
    );
  }

  private handleDisconnect(): void {
    this.connected = false;
    this.connecting = false;
    this.messageBuffer = '';
    
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket = null;
    }

    // Reject all pending requests
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Connection lost'));
    }
    this.pendingRequests.clear();

    this.emit('disconnect');
    
    // Attempt reconnection
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts!) {
      console.error('[SecureIPCClient] Max reconnection attempts reached');
      this.emit('maxReconnectAttemptsReached');
      return;
    }

    const delay = Math.min(
      this.config.reconnectInterval! * Math.pow(2, this.reconnectAttempts),
      30000 // Max 30 seconds
    );

    console.log(`[SecureIPCClient] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts + 1})`);
    
    this.reconnectTimer = setTimeout(() => {
      this.reconnectAttempts++;
      this.connect().catch((error) => {
        console.error('[SecureIPCClient] Reconnection failed:', error);
      });
    }, delay);
  }

  /**
   * Send a message and wait for response
   */
  async sendMessage(message: Omit<IPCMessage, 'id' | 'timestamp'>): Promise<IPCResponse> {
    if (!this.connected) {
      await this.connect();
    }

    return new Promise((resolve, reject) => {
      const messageId = this.generateMessageId();
      const fullMessage: IPCMessage = {
        ...message,
        id: messageId,
        timestamp: Date.now()
      };

      // Set up timeout
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(messageId);
        reject(new Error(`Request timeout for message ${messageId}`));
      }, this.config.requestTimeout!);

      // Store pending request
      this.pendingRequests.set(messageId, { resolve, reject, timeout });

      try {
        const messageStr = JSON.stringify(fullMessage) + '\n';
        this.socket!.write(messageStr);
      } catch (error) {
        clearTimeout(timeout);
        this.pendingRequests.delete(messageId);
        reject(error);
      }
    });
  }

  /**
   * Ping the server to check connectivity
   */
  async ping(): Promise<number> {
    const start = Date.now();
    await this.sendMessage({ type: MessageType.PING });
    return Date.now() - start;
  }

  /**
   * Disconnect from server
   */
  async disconnect(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.reconnectAttempts = this.config.maxReconnectAttempts!; // Prevent reconnection

    if (this.socket && this.connected) {
      return new Promise((resolve) => {
        this.socket!.end(() => {
          resolve();
        });
      });
    }
  }

  /**
   * Get client status
   */
  getStatus(): {
    connected: boolean;
    connecting: boolean;
    reconnectAttempts: number;
    pendingRequests: number;
    socketPath: string;
  } {
    return {
      connected: this.connected,
      connecting: this.connecting,
      reconnectAttempts: this.reconnectAttempts,
      pendingRequests: this.pendingRequests.size,
      socketPath: this.config.socketPath
    };
  }

  private generateMessageId(): string {
    return `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Check if client is healthy (connected and responsive)
   */
  async isHealthy(): Promise<boolean> {
    if (!this.connected) {
      return false;
    }

    try {
      const latency = await this.ping();
      return latency < 5000; // Consider healthy if ping < 5 seconds
    } catch {
      return false;
    }
  }
}