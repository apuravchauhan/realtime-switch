import { Providers } from '@realtime-switch/core';
import { ServerEventsExtractor, Checkpoint } from '@realtime-switch/core';
import { OAICheckpoint, GeminiCheckpoint } from '@realtime-switch/checkpoint';

export class CheckpointRegistry {
  private static readonly checkpointMap = new Map<Providers, new (accountId: string, sessionId: string, extractor: ServerEventsExtractor) => Checkpoint>([
    [Providers.OPENAI, OAICheckpoint],
    [Providers.GEMINI, GeminiCheckpoint],
  ]);

  static getCheckpoint(provider: Providers, accountId: string, sessionId: string, extractor: ServerEventsExtractor): Checkpoint {
    const CheckpointClass = this.checkpointMap.get(provider);

    if (!CheckpointClass) {
      throw new Error(`No checkpoint implementation found for provider: ${provider}`);
    }

    console.log(`Creating ${provider} checkpoint for account ${accountId}, session: ${sessionId}`);
    return new CheckpointClass(accountId, sessionId, extractor);
  }

  static getSupportedProviders(): Providers[] {
    return Array.from(this.checkpointMap.keys());
  }

  static isProviderSupported(provider: Providers): boolean {
    return this.checkpointMap.has(provider);
  }
}