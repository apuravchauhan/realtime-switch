import { ClientEventTransformer, ClientEventsExtractor, ProvidersEvent, Providers } from '@realtime-switch/core';
import { transformOAIToolsToGemini } from '../utils/ToolTransformUtils';

export class ClientOAIGeminiTransformer extends ClientEventTransformer {
  constructor(extractor: ClientEventsExtractor) {
    super(extractor);
  }

  userAudio(event: ProvidersEvent): void {
    const transformedEvent: ProvidersEvent = {
      src: Providers.GEMINI,
      payload: {
        realtimeInput: {
          audio: {
            data: event.payload.audio,
            mimeType: "audio/pcm;rate=24000"
          }
        }
      }
    };
    this.emitEvent(transformedEvent);
  }

  sessionUpdate(event: ProvidersEvent): void {
    const oaiSession = event.payload.session;
    const instructions = oaiSession?.instructions || "";

    // Transform tools if present
    const geminiTools = oaiSession?.tools ? transformOAIToolsToGemini(oaiSession.tools) : undefined;

    const setupPayload: any = {
      model: 'models/gemini-2.0-flash-live-001',  // Changed from gemini-2.0-flash-exp
      generationConfig: {
        responseModalities: ['AUDIO']
      },
      outputAudioTranscription: {},
      inputAudioTranscription: {},
      systemInstruction: {
        parts: [{ text: instructions }]
      }
    };

    // Add tools if they exist
    if (geminiTools && geminiTools.length > 0) {
      setupPayload.tools = geminiTools;
    }

    const transformedEvent: ProvidersEvent = {
      src: Providers.GEMINI,
      payload: {
        setup: setupPayload
      }
    };
    this.emitEvent(transformedEvent);
  }

  toolResponse(event: ProvidersEvent): void {
    // Transform OAI conversation.item.create to Gemini toolResponse format
    // Input: { type: "conversation.item.create", item: { type: "function_call_output", call_id, output } }
    // Output: { toolResponse: { functionResponses: [{ id, name, response }] } }

    const item = event.payload?.item;
    if (item?.type !== 'function_call_output') return;

    let response;
    try {
      response = item.output ? JSON.parse(item.output) : {};
    } catch (error) {
      response = {};
    }

    const transformedEvent: ProvidersEvent = {
      src: Providers.GEMINI,
      payload: {
        toolResponse: {
          functionResponses: [{
            id: item.call_id,  // call_id → id  
            name: "",  // OAI doesn't provide name in response, so empty string
            response: response  // JSON string → object
          }]
        }
      }
    };
    this.emitEvent(transformedEvent);
  }
}