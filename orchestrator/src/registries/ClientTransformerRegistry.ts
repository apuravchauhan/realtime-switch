import { Providers, EventManager, ClientEventsExtractor } from "@realtime-switch/core";
import { ClientGeminiOAITransformer, ClientOAIGeminiTransformer, NoOpClientTransformer } from "@realtime-switch/transformers";
import { OAIClientEventsExtractor, GeminiClientEventsExtractor } from "@realtime-switch/extractors";

export class ClientTransformerRegistry {
  private static readonly transformerMap = new Map<string, new (extractor: ClientEventsExtractor) => EventManager>([
    [`${Providers.OPENAI}-${Providers.GEMINI}`, ClientOAIGeminiTransformer],
    [`${Providers.GEMINI}-${Providers.OPENAI}`, ClientGeminiOAITransformer]
  ]);

  private static readonly extractorMap = new Map<Providers, new () => ClientEventsExtractor>([
    [Providers.OPENAI, OAIClientEventsExtractor],
    [Providers.GEMINI, GeminiClientEventsExtractor]
  ]);

  static getTransformer(apiStyle: Providers, provider: Providers): EventManager {
    if (apiStyle === provider) {
      const ExtractorClass = this.extractorMap.get(apiStyle);
      if (!ExtractorClass) {
        throw new Error(`Unsupported apiStyle for extractor: ${apiStyle}`);
      }
      const extractor = new ExtractorClass();
      return new NoOpClientTransformer(extractor);
    }

    const key = `${apiStyle}-${provider}`;
    const TransformerClass = this.transformerMap.get(key);
    
    if (!TransformerClass) {
      throw new Error(
        `Unsupported client transformer combination: ${apiStyle} -> ${provider}. ` +
        `Supported combinations: ${Array.from(this.transformerMap.keys()).join(', ')}`
      );
    }
    
    const ExtractorClass = this.extractorMap.get(apiStyle);
    if (!ExtractorClass) {
      throw new Error(`Unsupported apiStyle for extractor: ${apiStyle}`);
    }
    
    // ClientTransformer receives events FROM client in apiStyle format
    const extractor = new ExtractorClass();
    
    return new TransformerClass(extractor);
  }

  static getSupportedCombinations(): string[] {
    return Array.from(this.transformerMap.keys());
  }

  static isSupported(apiStyle: Providers, provider: Providers): boolean {
    if (apiStyle === provider) {
      return true;
    }
    
    const key = `${apiStyle}-${provider}`;
    return this.transformerMap.has(key);
  }
}