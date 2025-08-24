import WebSocket from 'ws';
import { ProviderManager, Providers, ProvidersEvent, Config, ConfigKeys, PerformanceStats } from '@realtime-switch/core';

export default class OAIEventManager extends ProviderManager {
  private oaiSocket!: WebSocket;
  private selfClosing: boolean = false;
  private statsCallback?: (stats: PerformanceStats) => void;
  private lastPingTime: number = 0;

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
    this.oaiSocket.addEventListener('open', () => this.init());
    this.oaiSocket.addEventListener('message', (event) =>
      this.emitEvent({ src: Providers.OPENAI, payload: JSON.parse(event.data as string) }));
    this.oaiSocket.addEventListener('error', (event) =>
      this.error({ src: Providers.OPENAI, payload: event }));
    this.oaiSocket.addEventListener('close', () => this.handleClose());

    // Handle pong responses with latency calculation
    this.oaiSocket.on('pong', (data: Buffer) => {
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
    });

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
    super.cleanup();
    this.selfClosing = true;
    
    if (this.oaiSocket && this.oaiSocket.readyState !== WebSocket.CLOSED) {
      this.oaiSocket.close();
    }
  }

  isConnected(): boolean {
    return this.oaiSocket && this.oaiSocket.readyState === WebSocket.OPEN;
  }
}