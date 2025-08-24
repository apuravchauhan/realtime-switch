import { EventManager, ProviderManager, ProvidersEvent, Providers, Checkpoint, Switch, PerformanceStats } from '@realtime-switch/core';
import { PingSwitch } from '@realtime-switch/switch';
import { ProviderRegistry, ServerTransformerRegistry, ClientTransformerRegistry, ExtractorRegistry, CheckpointRegistry } from './registries';
import { SessionManager } from './SessionManager';

export class Pipeline {
  private sessionManager: SessionManager;
  private providerEventManager: ProviderManager;
  private serverTransformer: EventManager;
  private clientTransformer: EventManager;
  private checkpoint: Checkpoint;
  private switch!: Switch;

  private readonly apiStyle: Providers;
  private provider: Providers;
  private readonly clientSocket: EventManager;
  private readonly sessionId: string;

  constructor(apiStyle: Providers, sessionId: string, clientSocket: EventManager, provider?: Providers) {
    this.apiStyle = apiStyle;
    this.provider = provider || apiStyle;
    this.sessionId = sessionId;
    this.clientSocket = clientSocket;

    // ✅ Create SessionManager first
    this.sessionManager = new SessionManager(this.apiStyle, this.sessionId);

    const pipeline = this.determinePipeline(apiStyle, this.provider);
    this.providerEventManager = pipeline.provider;
    this.serverTransformer = pipeline.serverTransformer;
    this.clientTransformer = pipeline.clientTransformer;

    // Create checkpoint with extractor for the apiStyle (client format for conversation logging)
    const checkpointExtractor = ExtractorRegistry.getExtractor(this.apiStyle);
    this.checkpoint = CheckpointRegistry.getCheckpoint(this.apiStyle, sessionId, checkpointExtractor);

    // Initialize switching logic - always enabled for MVP
    this.initializeProviderSwitching();

    this.initPipeline();
  }

  private determinePipeline(apiStyle: Providers, provider: Providers): {
    provider: ProviderManager;
    serverTransformer: EventManager;
    clientTransformer: EventManager;
  } {
    const providerEventManager = ProviderRegistry.getProvider(provider, this.sessionId);

    // Register connection callback - no type checking needed with ProviderManager
    providerEventManager.onConnected(() => this.onProviderConnected());

    return {
      provider: providerEventManager,
      serverTransformer: ServerTransformerRegistry.getTransformer(provider, apiStyle),
      clientTransformer: ClientTransformerRegistry.getTransformer(apiStyle, provider)
    };
  }

  private initializeProviderSwitching(): void {
    this.switch = new PingSwitch(this.provider);

    // Register switch callback to trigger provider updates
    this.switch.onSwitch((targetProvider: Providers) => {
      console.log(`[Pipeline] Switch triggered: ${this.provider} -> ${targetProvider}`);
      this.updateProvider(targetProvider);
    });

    // Register current provider for performance monitoring
    this.registerProviderForSwitching(this.providerEventManager);
  }

  private registerProviderForSwitching(provider: ProviderManager): void {
    provider.onConnectionStats((stats: PerformanceStats) => {
      this.switch.addStats(stats);
    });
  }


  public receiveEvent(event: any): void {
    const providersEvent: ProvidersEvent = {
      src: this.apiStyle,
      payload: event
    };

    // ✅ Send to SessionManager first (replaces direct clientTransformer)
    this.sessionManager.receiveEvent(providersEvent);
  }

  // Provider connected callback method (called by individual callback function)
  private async onProviderConnected(): Promise<void> {
    console.log('[Pipeline] Provider connected, replaying session configuration...');

    // ✅ Get session config with conversation history from SessionManager
    const sessionConfig = await this.sessionManager.getSessionConfiguration();
    if (sessionConfig && sessionConfig.src === this.apiStyle) {
      console.log(`[Pipeline] Replaying session config with conversation context:`, sessionConfig.payload);

      // ✅ Skip SessionManager to prevent duplicate saves - replay directly to ClientTransformer
      this.clientTransformer.receiveEvent(sessionConfig);
    } else {
      console.log('[Pipeline] No session configuration to replay');
    }
  }

  public updateProvider(newProvider: Providers): void {
    console.log(`Updating provider from ${this.provider} to ${newProvider}`);

    // Clean up old provider components (keep SessionManager and checkpoint)
    if (this.providerEventManager) {
      this.providerEventManager.cleanup();
    }
    if (this.serverTransformer && 'cleanup' in this.serverTransformer) {
      this.serverTransformer.cleanup();
    }
    if (this.clientTransformer && 'cleanup' in this.clientTransformer) {
      this.clientTransformer.cleanup();
    }

    this.provider = newProvider;

    const pipeline = this.determinePipeline(this.apiStyle, newProvider);

    this.providerEventManager = pipeline.provider;
    this.serverTransformer = pipeline.serverTransformer;
    this.clientTransformer = pipeline.clientTransformer;

    // Keep checkpoint format same (apiStyle doesn't change), just update provider pipeline
    // Checkpoint continues to log in client format (apiStyle)
    // Keep SessionManager - it retains session state across provider switches

    // Re-register new provider for switching
    this.registerProviderForSwitching(this.providerEventManager);

    this.initPipeline();

    // Note: Session replay will happen automatically when provider connects via onProviderConnected callback
  }



  private initPipeline(): void {
    console.log('Initializing pipeline with SessionManager...');
    console.log(`Configuration:`, {
      apiStyle: this.apiStyle,
      provider: this.provider,
      clientTransformer: this.clientTransformer,
      serverTransformer: this.serverTransformer,
    });

    // ✅ Setup pipeline flow with SessionManager as first step
    // SessionManager -> ClientTransformer -> ProviderEventManager -> ServerTransformer -> [SocketEventManager, Checkpoint]
    this.sessionManager.addSubscribers(this.clientTransformer);
    this.clientTransformer.addSubscribers(this.providerEventManager);
    this.providerEventManager.addSubscribers(this.serverTransformer);
    this.serverTransformer.addSubscribers(this.clientSocket, this.checkpoint);
  }

  public cleanup(): void {
    // ✅ Clean up all pipeline components including SessionManager
    this.sessionManager?.cleanup();
    this.providerEventManager?.cleanup();
    this.serverTransformer?.cleanup();
    this.clientTransformer?.cleanup();
    this.checkpoint?.cleanup();

    // ✅ Clear all references
    this.sessionManager = null as any;
    this.providerEventManager = null as any;
    this.serverTransformer = null as any;
    this.clientTransformer = null as any;
  }

  // Debug method for testing switching
  public getSwitchDebugInfo() {
    return this.switch?.getDebugInfo();
  }
}