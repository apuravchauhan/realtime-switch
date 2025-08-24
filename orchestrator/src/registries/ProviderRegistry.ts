import { ProviderManager, Providers } from '@realtime-switch/core';
import { OAIEventManager } from '@realtime-switch/providers-oai';
import { GeminiEventManager } from '@realtime-switch/providers-gemini';

export class ProviderRegistry {
  static getProvider(provider: Providers, sessionId?: string): ProviderManager {
    if (provider === Providers.OPENAI) {
      return new OAIEventManager();
    }
    if (provider === Providers.GEMINI) {
      return new GeminiEventManager(sessionId || 'default-session');
    }

    throw new Error(`Unsupported provider: ${provider}`);
  }

  static getSupportedProviders(): Providers[] {
    return [Providers.OPENAI, Providers.GEMINI];
  }

  static isProviderSupported(provider: Providers): boolean {
    return provider === Providers.OPENAI ||
      provider === Providers.GEMINI;
  }
}