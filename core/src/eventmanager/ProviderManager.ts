import { EventManager } from './EventManager';
import { ProviderConManager } from './ProviderConManager';

export abstract class ProviderManager extends EventManager implements ProviderConManager {
  protected connectionCallback: (() => void) | null = null;

  abstract onConnectionStats(callback: (stats: import('./ProviderConManager').PerformanceStats) => void): void;
  abstract sendPing(): void;

  onConnected(callback: () => void): void {
    this.connectionCallback = callback;
  }

  protected triggerConnectionCallback(): void {
    if (this.connectionCallback) {
      this.connectionCallback();
    }
  }

  cleanup(): void {
    super.cleanup();
    this.connectionCallback = null;
  }
}