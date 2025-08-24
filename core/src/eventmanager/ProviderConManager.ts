// Simplified performance stats for provider switching
export type PerformanceStats = {
  time: number;           // Timestamp when metric was captured
  latency: number;        // Ping latency in ms
  provider: string;       // Which provider this metric is for (Providers enum value)
}

// Enhanced interface for provider connection management and monitoring
export interface ProviderConManager {
  onConnected(callback: () => void): void;
  onConnectionStats(callback: (stats: PerformanceStats) => void): void;
  sendPing(): void;
}