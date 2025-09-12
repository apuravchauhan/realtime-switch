import WebSocket from 'ws';
import { ProviderManager, Providers, ProvidersEvent, Config, ConfigKeys, PerformanceStats } from '@realtime-switch/core';
import { BaseCheckpoint } from '@realtime-switch/checkpoint';

export default class GeminiEventManager extends ProviderManager {
  private geminiSocket!: WebSocket;
  private selfClosing: boolean = false;
  private sessionId: string;
  private statsCallback?: (stats: PerformanceStats) => void;
  private lastPingTime: number = 0;
  private isSetupComplete: boolean = false;
  private isProviderConnectedCallbackCalled: boolean = false;
  
  // Store event handlers for proper cleanup
  private openHandler: (() => void) | null = null;
  private messageHandler: ((event: any) => void) | null = null;
  private errorHandler: ((event: any) => void) | null = null;
  private closeHandler: ((event: any) => void) | null = null;
  private pongHandler: ((data: Buffer) => void) | null = null;

  constructor(sessionId: string) {
    super();
    this.sessionId = sessionId || 'default-session';
    this.connect();
  }


  onConnectionStats(callback: (stats: PerformanceStats) => void): void {
    this.statsCallback = callback;
  }

  sendPing(): void {
    const now = Date.now();
    if (now - this.lastPingTime >= 5000) { // 5 second interval
      this.lastPingTime = now;
      if (this.geminiSocket && this.geminiSocket.readyState === WebSocket.OPEN) {
        const pingData = Buffer.from(now.toString());
        this.geminiSocket.ping(pingData);
        console.log(`[Gemini] Sent ping at ${now}`);
      }
    }
  }

  private connect(): void {
    const apiKey = Config.getInstance().get(ConfigKeys.GEMINI_API_KEY);
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY not found in config');
    }

    // Direct WebSocket URL based on official Gemini Live API documentation
    const websocketBaseUrl = 'wss://generativelanguage.googleapis.com';
    const apiVersion = 'v1beta';
    const method = 'BidiGenerateContent';
    const url = `${websocketBaseUrl}/ws/google.ai.generativelanguage.${apiVersion}.GenerativeService.${method}?key=${apiKey}`;
    
    console.log(`[Gemini] Connecting to: ${url}`);

    this.geminiSocket = new WebSocket(url);
    
    // Store handlers for later removal
    this.openHandler = () => this.handleOpen();
    this.messageHandler = (event) => this.handleMessage(event as any);
    this.errorHandler = (event) => this.handleError(event as any);
    this.closeHandler = (event) => this.handleClose(event as any);
    this.pongHandler = (data: Buffer) => {
      if (data.length === 0) {
        console.log(`[Gemini] Received pong from Gemini server (empty)`);
      } else {
        try {
          const pingTime = parseInt(data.toString());
          const latency = Date.now() - pingTime;
          console.log(`[Gemini] Received pong, latency: ${latency}ms`);
          
          if (this.statsCallback) {
            this.statsCallback({
              time: Date.now(),
              latency,
              provider: Providers.GEMINI
            });
          }
        } catch (error) {
          console.error(`[Gemini] Error parsing pong data:`, error);
        }
      }
    };
    
    this.geminiSocket.addEventListener('open', this.openHandler);
    this.geminiSocket.addEventListener('message', this.messageHandler);
    this.geminiSocket.addEventListener('error', this.errorHandler);
    this.geminiSocket.addEventListener('close', this.closeHandler);
    this.geminiSocket.on('pong', this.pongHandler);
  }

  private handleOpen(): void {
    console.log(`[Gemini] WebSocket connected`);
    
    // Notify that provider is connected via parent's callback system
    this.triggerConnectionCallback();
  }


  private handleMessage(event: MessageEvent): void {
    try {
      const message = JSON.parse(event.data as string);

      // Check for error messages
      if (message.error) {
        console.error(`[Gemini] Server error:`, message.error);
      }

      // Emit all messages as ProvidersEvent (matching OAI pattern)
      this.emitEvent({ 
        src: Providers.GEMINI, 
        payload: message 
      });
    } catch (error) {
      console.error(`[Gemini] Error parsing message:`, error);
      console.error(`[Gemini] Raw message:`, event.data);
    }
  }

  private handleError(event: Event): void {
    console.error(`[Gemini] WebSocket error:`, event);
    this.emitEvent({ 
      src: Providers.GEMINI, 
      payload: { 
        type: 'error', 
        error: event 
      } 
    });
  }

  private handleClose(event?: any): void {
    if (event) {
      console.log(`[Gemini] WebSocket closed with code: ${event.code}, reason: ${event.reason || 'No reason'}`);
    } else {
      console.log(`[Gemini] WebSocket closed`);
    }
    
    if (this.selfClosing) {
      // Self-initiated close, don't reconnect
      this.selfClosing = false;
      this.cleanup();
    } else {
      // Network-initiated close, attempt immediate reconnection
      console.log('[Gemini] Connection closed unexpectedly, reconnecting immediately...');
      this.connect();
    }
  }

  receiveEvent(event: ProvidersEvent): void {
    // Send ping if needed before processing event
    this.sendPing();
    
    if (this.geminiSocket && this.geminiSocket.readyState === WebSocket.OPEN) {
      this.geminiSocket.send(JSON.stringify(event.payload));
    }
  }

  cleanup(): void {
    console.log(`[Gemini] Starting cleanup - removing event listeners and closing connection`);
    super.cleanup();
    this.selfClosing = true;
    
    if (this.geminiSocket) {
      // ✅ Remove all event listeners to prevent memory leaks
      if (this.openHandler) {
        this.geminiSocket.removeEventListener('open', this.openHandler);
        this.openHandler = null;
      }
      if (this.messageHandler) {
        this.geminiSocket.removeEventListener('message', this.messageHandler);
        this.messageHandler = null;
      }
      if (this.errorHandler) {
        this.geminiSocket.removeEventListener('error', this.errorHandler);
        this.errorHandler = null;
      }
      if (this.closeHandler) {
        this.geminiSocket.removeEventListener('close', this.closeHandler);
        this.closeHandler = null;
      }
      if (this.pongHandler) {
        this.geminiSocket.off('pong', this.pongHandler);
        this.pongHandler = null;
      }
      
      // Close the WebSocket connection
      if (this.geminiSocket.readyState !== WebSocket.CLOSED) {
        this.geminiSocket.close();
      }
      
      console.log(`[Gemini] All event listeners removed and connection closed`);
    }
    
    // Clear callback references
    this.statsCallback = undefined;
  }

  isConnected(): boolean {
    return this.geminiSocket && this.geminiSocket.readyState === WebSocket.OPEN;
  }

  getSessionId(): string {
    return this.sessionId;
  }
}