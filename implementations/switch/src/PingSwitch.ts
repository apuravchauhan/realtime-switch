import { Switch, SwitchCallback, Providers, PerformanceStats, Config, ConfigKeys } from '@realtime-switch/core';

/**
 * PingSwitch - A latency-based switching implementation
 * 
 * This implementation monitors provider performance by tracking latency measurements
 * and automatically switches to an alternative provider when consecutive high latency
 * measurements exceed configured thresholds.
 * 
 * Key features:
 * - Configurable latency threshold
 * - Configurable consecutive failure count
 * - Automatic provider switching based on performance
 * - Reset mechanism to prevent oscillation
 */
export class PingSwitch implements Switch {
  private providerLatencies = new Map<Providers, number[]>();
  private switchCallback?: SwitchCallback;
  private currentProvider: Providers;
  private readonly config: Config;
  
  // Configurable thresholds from environment
  private readonly LATENCY_THRESHOLD_MS: number;
  private readonly CONSECUTIVE_FAILURES: number;
  
  constructor(initialProvider: Providers) {
    this.currentProvider = initialProvider;
    this.config = Config.getInstance();
    
    // Load configuration values with defaults
    this.LATENCY_THRESHOLD_MS = parseInt(this.config.get(ConfigKeys.SWITCH_LATENCY_THRESHOLD_MS) || '500');
    this.CONSECUTIVE_FAILURES = parseInt(this.config.get(ConfigKeys.SWITCH_FAILURE_COUNT) || '3');
    
    // Initialize empty arrays for both providers
    this.providerLatencies.set(Providers.OPENAI, []);
    this.providerLatencies.set(Providers.GEMINI, []);
  }

  onSwitch(callback: SwitchCallback): void {
    this.switchCallback = callback;
  }

  addStats(stats: PerformanceStats): void {
    const latencies = this.providerLatencies.get(stats.provider as Providers);
    if (!latencies) return;
    
    // Add new latency measurement
    latencies.push(stats.latency);
    
    console.log(`[PingSwitch] ${stats.provider} ping: ${stats.latency}ms (current: ${this.currentProvider})`);
    
    // Only evaluate switching for current provider
    if (stats.provider === this.currentProvider) {
      this.evaluateSwitching();
    }
  }

  private evaluateSwitching(): void {
    const currentLatencies = this.providerLatencies.get(this.currentProvider);
    if (!currentLatencies || currentLatencies.length < this.CONSECUTIVE_FAILURES) {
      return; // Not enough data yet
    }
    
    // Check last N consecutive measurements
    const lastNLatencies = currentLatencies.slice(-this.CONSECUTIVE_FAILURES);
    const allAboveThreshold = lastNLatencies.every(latency => latency > this.LATENCY_THRESHOLD_MS);
    
    if (allAboveThreshold) {
      const targetProvider = this.getOtherProvider();
      console.log(`[PingSwitch] ${this.currentProvider} exceeded ${this.LATENCY_THRESHOLD_MS}ms for ${this.CONSECUTIVE_FAILURES} consecutive times`);
      console.log(`[PingSwitch] Last ${this.CONSECUTIVE_FAILURES} latencies:`, lastNLatencies);
      
      this.performSwitch(targetProvider);
    }
  }

  private performSwitch(targetProvider: Providers): void {
    console.log(`[PingSwitch] Switching from ${this.currentProvider} to ${targetProvider}`);
    
    // Reset stats for the provider we're switching away from
    this.providerLatencies.set(this.currentProvider, []);
    
    // Update current provider
    this.currentProvider = targetProvider;
    
    // Trigger the callback
    this.switchCallback?.(targetProvider);
  }

  private getOtherProvider(): Providers {
    // Simple toggle between OPENAI and GEMINI for MVP
    return this.currentProvider === Providers.OPENAI ? Providers.GEMINI : Providers.OPENAI;
  }

  // Debug method to see current state
  public getDebugInfo() {
    return {
      currentProvider: this.currentProvider,
      openaiLatencies: this.providerLatencies.get(Providers.OPENAI),
      geminiLatencies: this.providerLatencies.get(Providers.GEMINI),
      thresholds: {
        latencyThresholdMs: this.LATENCY_THRESHOLD_MS,
        consecutiveFailures: this.CONSECUTIVE_FAILURES
      }
    };
  }
}