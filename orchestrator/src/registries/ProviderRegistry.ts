import { ProviderManager, Providers } from '@realtime-switch/core';
import { OAIEventManager } from '@realtime-switch/providers-oai';
import { GeminiEventManager } from '@realtime-switch/providers-gemini';

export class ProviderRegistry {
  static getProvider(provider: Providers, accountId: string, sessionId: string): ProviderManager {
    if (provider === Providers.OPENAI) {
      return new OAIEventManager(accountId, sessionId);
    }
    if (provider === Providers.GEMINI) {
      return new GeminiEventManager(accountId, sessionId);
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