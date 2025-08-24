import { Providers, ServerEventsExtractor, ClientEventsExtractor } from "@realtime-switch/core";
import { OAIServerEventsExtractor, GeminiServerEventsExtractor, OAIClientEventsExtractor, GeminiClientEventsExtractor } from "@realtime-switch/extractors";

export class ExtractorRegistry {
  private static readonly serverExtractorMap = new Map<Providers, new () => ServerEventsExtractor>([
    [Providers.OPENAI, OAIServerEventsExtractor],
    [Providers.GEMINI, GeminiServerEventsExtractor]
  ]);

  private static readonly clientExtractorMap = new Map<Providers, new () => ClientEventsExtractor>([
    [Providers.OPENAI, OAIClientEventsExtractor],
    [Providers.GEMINI, GeminiClientEventsExtractor]
  ]);

  static getExtractor(provider: Providers): ServerEventsExtractor {
    const ExtractorClass = this.serverExtractorMap.get(provider);
    if (!ExtractorClass) {
      throw new Error(`Unsupported provider for server extractor: ${provider}`);
    }
    return new ExtractorClass();
  }

  static getClientExtractor(provider: Providers): ClientEventsExtractor {
    const ExtractorClass = this.clientExtractorMap.get(provider);
    if (!ExtractorClass) {
      throw new Error(`Unsupported provider for client extractor: ${provider}`);
    }
    return new ExtractorClass();
  }

  static isSupported(provider: Providers): boolean {
    return this.serverExtractorMap.has(provider) && this.clientExtractorMap.has(provider);
  }

  static getSupportedProviders(): Providers[] {
    return Array.from(this.serverExtractorMap.keys());
  }
}