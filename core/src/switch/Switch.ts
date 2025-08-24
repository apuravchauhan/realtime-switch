import { Providers } from '../eventmanager/Providers';
import { PerformanceStats } from '../eventmanager/ProviderConManager';

export type SwitchCallback = (targetProvider: Providers) => void;

// Switch interface - defines the contract for all switching implementations
export interface Switch {
  onSwitch(callback: SwitchCallback): void;
  addStats(stats: PerformanceStats): void;
  getDebugInfo(): any;
}