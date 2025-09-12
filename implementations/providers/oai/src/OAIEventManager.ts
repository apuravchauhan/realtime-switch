import WebSocket from 'ws';
import { ProviderManager, Providers, ProvidersEvent, Config, ConfigKeys, PerformanceStats } from '@realtime-switch/core';

export default class OAIEventManager extends ProviderManager {
  private oaiSocket!: WebSocket;
  private selfClosing: boolean = false;
  private statsCallback?: (stats: PerformanceStats) => void;
  private lastPingTime: number = 0;
  
  // Store event handlers for proper cleanup
  private openHandler: (() => void) | null = null;
  private messageHandler: ((event: any) => void) | null = null;
  private errorHandler: ((event: any) => void) | null = null;
  private closeHandler: (() => void) | null = null;
  private pongHandler: ((data: Buffer) => void) | null = null;

  constructor() {
    super();
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
        console.log(`[OAI] Sent ping at ${now}`);
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
    this.messageHandler = (event) => this.emitEvent({ src: Providers.OPENAI, payload: JSON.parse(event.data as string) });
    this.errorHandler = (event) => this.error({ src: Providers.OPENAI, payload: event });
    this.closeHandler = () => this.handleClose();
    
    this.oaiSocket.addEventListener('open', this.openHandler);
    this.oaiSocket.addEventListener('message', this.messageHandler);
    this.oaiSocket.addEventListener('error', this.errorHandler);
    this.oaiSocket.addEventListener('close', this.closeHandler);

    // Handle pong responses with latency calculation
    this.pongHandler = (data: Buffer) => {
      if (data.length === 0) {
        console.log(`[OAI] Received pong from OpenAI server (empty)`);
      } else {
        try {
          const pingTime = parseInt(data.toString());
          const latency = Date.now() - pingTime;
          console.log(`[OAI] Received pong, latency: ${latency}ms`);
          
          if (this.statsCallback) {
            this.statsCallback({
              time: Date.now(),
              latency,
              provider: Providers.OPENAI
            });
          }
        } catch (error) {
          console.error(`[OAI] Error parsing pong data:`, error);
        }
      }
    };
    this.oaiSocket.on('pong', this.pongHandler);

  }

  private init() {
    // Notify that provider is connected via parent's callback system
    this.triggerConnectionCallback();
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
      console.log('OAI WebSocket closed unexpectedly, reconnecting immediately...');
      this.connect();
    }
  }

  cleanup() {
    console.log(`[OAI] Starting cleanup - removing event listeners and closing connection`);
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
      
      // Close the WebSocket connection
      if (this.oaiSocket.readyState !== WebSocket.CLOSED) {
        this.oaiSocket.close();
      }
      
      console.log(`[OAI] All event listeners removed and connection closed`);
    }
    
    // Clear callback references
    this.statsCallback = undefined;
  }

  isConnected(): boolean {
    return this.oaiSocket && this.oaiSocket.readyState === WebSocket.OPEN;
  }
}