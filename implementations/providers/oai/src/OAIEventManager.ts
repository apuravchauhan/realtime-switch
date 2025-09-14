import WebSocket from 'ws';
import { ProviderManager, Providers, ProvidersEvent, Config, ConfigKeys, PerformanceStats, Logger } from '@realtime-switch/core';
import { BaseCheckpoint } from '@realtime-switch/checkpoint';

const CLASS_NAME = 'OAIEventManager';

export default class OAIEventManager extends ProviderManager {
  private oaiSocket!: WebSocket;
  private selfClosing: boolean = false;
  private accountId: string;
  private sessionId: string;
  private statsCallback?: (stats: PerformanceStats) => void;
  private lastPingTime: number = 0;
  
  // Store event handlers for proper cleanup
  private openHandler: (() => void) | null = null;
  private messageHandler: ((event: any) => void) | null = null;
  private errorHandler: ((event: any) => void) | null = null;
  private closeHandler: (() => void) | null = null;
  private pongHandler: ((data: Buffer) => void) | null = null;

  constructor(accountId: string, sessionId: string) {
    super();
    this.accountId = accountId;
    this.sessionId = sessionId;
    this.connect();
  }


  onConnectionStats(callback: (stats: PerformanceStats) => void): void {
    this.statsCallback = callback;
  }

  sendPing(): void {
    const now = Date.now();
    if (now - this.lastPingTime >= 5000) { // 5 second interval
      this.lastPingTime = now;
      if (this.oaiSocket && this.oaiSocket.readyState === WebSocket.OPEN) {
        const pingData = Buffer.from(now.toString());
        this.oaiSocket.ping(pingData);
        Logger.debug(CLASS_NAME, this.accountId, 'Sent ping at {}', now);
      }
    }
  }

  private connect(): void {
    const key = Config.getInstance().get(ConfigKeys.OPENAI_API_KEY);
    this.oaiSocket = new WebSocket("wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17", {
      headers: {
        "Authorization": `Bearer ${key}`,
        "OpenAI-Beta": "realtime=v1",
      }
    });
    // Store handlers for later removal
    this.openHandler = () => this.init();
    this.messageHandler = (event) => {
      const payload = JSON.parse(event.data as string);
      
      // Check for usage data in response.done events and record directly
      if (payload.type === 'response.done' && payload.response?.usage) {
        Logger.debug(CLASS_NAME, this.accountId, 'Recording usage - tokens: {}', payload.response.usage.total_tokens);
        
        this.recordUsage(
          'OPENAI',
          payload.response.usage.input_tokens || 0,
          payload.response.usage.output_tokens || 0,
          payload.response.usage.total_tokens || 0
        ).catch(error => {
          Logger.error(CLASS_NAME, this.accountId, 'Usage recording failed', error as Error);
        });
      }
      
      this.emitEvent({ src: Providers.OPENAI, payload });
    };
    this.errorHandler = (event) => this.error({ src: Providers.OPENAI, payload: event });
    this.closeHandler = () => this.handleClose();
    
    this.oaiSocket.addEventListener('open', this.openHandler);
    this.oaiSocket.addEventListener('message', this.messageHandler);
    this.oaiSocket.addEventListener('error', this.errorHandler);
    this.oaiSocket.addEventListener('close', this.closeHandler);

    // Handle pong responses with latency calculation
    this.pongHandler = (data: Buffer) => {
      if (data.length === 0) {
        Logger.debug(CLASS_NAME, this.accountId, 'Received pong from OpenAI server (empty)');
      } else {
        try {
          const pingTime = parseInt(data.toString());
          const latency = Date.now() - pingTime;
          Logger.debug(CLASS_NAME, this.accountId, 'Received pong, latency: {}ms', latency);
          
          if (this.statsCallback) {
            this.statsCallback({
              time: Date.now(),
              latency,
              provider: Providers.OPENAI
            });
          }
        } catch (error) {
          Logger.error(CLASS_NAME, this.accountId, 'Error parsing pong data', error as Error);
        }
      }
    };
    this.oaiSocket.on('pong', this.pongHandler);

  }

  private init() {
    // Notify that provider is connected via parent's callback system
    this.triggerConnectionCallback();
  }

  // Usage recording method
  private async recordUsage(provider: string, inputTokens: number, outputTokens: number, totalTokens: number): Promise<void> {
    try {
      const persistence = BaseCheckpoint.getPersistence();
      const usageData = {
        account_id: this.accountId,
        session_id: this.sessionId,
        provider: provider,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: totalTokens,
        audio_duration_ms: 0
      };

      persistence.insert('usage_metrics', usageData);
    } catch (error) {
      Logger.error(CLASS_NAME, this.accountId, 'Failed to record usage', error as Error);
      throw error;
    }
  }

  private error(event: ProvidersEvent) {
    // Handle error event
  }
  receiveEvent(event: ProvidersEvent): void {
    // Send ping if needed before processing event
    this.sendPing();
    
    if (this.oaiSocket && this.oaiSocket.readyState === WebSocket.OPEN) {
      this.oaiSocket.send(JSON.stringify(event.payload));
    }
  }

  private handleClose(): void {
    if (this.selfClosing) {
      // Self-initiated close, don't reconnect
      this.selfClosing = false;
      this.cleanup();
    } else {
      // Network-initiated close, attempt immediate reconnection
      Logger.warn(CLASS_NAME, this.accountId, 'WebSocket closed unexpectedly, reconnecting immediately...');
      this.connect();
    }
  }

  cleanup() {
    Logger.debug(CLASS_NAME, this.accountId, 'Starting cleanup - removing event listeners and closing connection');
    super.cleanup();
    this.selfClosing = true;
    
    if (this.oaiSocket) {
      // ✅ Remove all event listeners to prevent memory leaks
      if (this.openHandler) {
        this.oaiSocket.removeEventListener('open', this.openHandler);
        this.openHandler = null;
      }
      if (this.messageHandler) {
        this.oaiSocket.removeEventListener('message', this.messageHandler);
        this.messageHandler = null;
      }
      if (this.errorHandler) {
        this.oaiSocket.removeEventListener('error', this.errorHandler);
        this.errorHandler = null;
      }
      if (this.closeHandler) {
        this.oaiSocket.removeEventListener('close', this.closeHandler);
        this.closeHandler = null;
      }
      if (this.pongHandler) {
        this.oaiSocket.off('pong', this.pongHandler);
        this.pongHandler = null;
      }
      
      // Close the WebSocket connection safely
      try {
        if (this.oaiSocket.readyState !== WebSocket.CLOSED) {
          this.oaiSocket.close();
        }
      } catch (error) {
        Logger.error(CLASS_NAME, this.accountId, 'Error closing WebSocket during cleanup', error instanceof Error ? error : new Error(String(error)));
        // Don't throw - cleanup should continue
      }
      
      Logger.debug(CLASS_NAME, this.accountId, 'All event listeners removed and connection closed');
    }
    
    // Clear callback references
    this.statsCallback = undefined;
  }

  isConnected(): boolean {
    return this.oaiSocket && this.oaiSocket.readyState === WebSocket.OPEN;
  }
}