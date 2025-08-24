import { Providers, EventManager, ServerEventsExtractor, ServerEvents } from "@realtime-switch/core";
import { ServerGeminiOAITransformer, ServerOAIGeminiTransformer, NoOpServerTransformer } from "@realtime-switch/transformers";
import { ExtractorRegistry } from "./ExtractorRegistry";

export class ServerTransformerRegistry {
  private static readonly transformerMap = new Map<string, new (extractor: ServerEventsExtractor) => EventManager>([
    [`${Providers.GEMINI}-${Providers.OPENAI}`, ServerGeminiOAITransformer],  // Gemini provider → OpenAI apiStyle
    [`${Providers.OPENAI}-${Providers.GEMINI}`, ServerOAIGeminiTransformer]   // OpenAI provider → Gemini apiStyle  
  ]);


  static getTransformer(provider: Providers, apiStyle: Providers): EventManager {
    if (provider === apiStyle) {
      const extractor = ExtractorRegistry.getExtractor(provider);
      return new NoOpServerTransformer(extractor);
    }

    const key = `${provider}-${apiStyle}`;
    const TransformerClass = this.transformerMap.get(key);
    
    if (!TransformerClass) {
      throw new Error(
        `Unsupported server transformer combination: ${provider} -> ${apiStyle}. ` +
        `Supported combinations: ${Array.from(this.transformerMap.keys()).join(', ')}`
      );
    }
    
    // FIX: ServerTransformer receives events FROM provider, so use provider's extractor
    const extractor = ExtractorRegistry.getExtractor(provider);
    return new TransformerClass(extractor);
  }

  static getSupportedCombinations(): string[] {
    return Array.from(this.transformerMap.keys());
  }

  static isSupported(provider: Providers, apiStyle: Providers): boolean {
    if (provider === apiStyle) {
      return ExtractorRegistry.isSupported(provider);
    }
    
    const key = `${provider}-${apiStyle}`;
    return this.transformerMap.has(key) && ExtractorRegistry.isSupported(provider);
  }
}