import { ClientEventTransformer, ClientEventsExtractor, ProvidersEvent, Providers } from '@realtime-switch/core';
import { transformGeminiToolsToOAI } from '../utils/ToolTransformUtils';

export class ClientGeminiOAITransformer extends ClientEventTransformer {
  constructor(extractor: ClientEventsExtractor) {
    super(extractor);
  }

  receiveEvent(event: ProvidersEvent): void {
    // Call parent to trigger extractor (which calls sessionUpdate, userAudio, etc.)
    super.receiveEvent(event);
  }

  userAudio(event: ProvidersEvent): void {
    // Transform Gemini audio event to OAI format
    // Handle both possible Gemini input formats
    let audioData;
    
    if (event.payload.realtimeInput?.audio?.data) {
      // Standard Gemini realtimeInput format
      audioData = event.payload.realtimeInput.audio.data;
    } else if (event.payload.audio?.data) {
      // Legacy/direct audio format
      audioData = event.payload.audio.data;
    } else {
      console.error('[ClientGeminiOAITransformer] Unknown Gemini audio format:', event.payload);
      return;
    }

    const transformedEvent: ProvidersEvent = {
      src: Providers.OPENAI,
      payload: {
        type: 'input_audio_buffer.append',
        audio: audioData
      }
    };
    this.emitEvent(transformedEvent);
  }

  sessionUpdate(event: ProvidersEvent): void {
    // Transform Gemini setup to OAI session.update format
    // Input: { setup: { model, generationConfig, systemInstruction: { parts: [{ text }] }, tools, ... } }
    // Output: { type: "session.update", session: { modalities, turn_detection, voice, instructions, tools, ... } }
    
    const geminiSetup = event.payload.setup;

    // Extract instructions by concatenating all text parts
    let instructions = "";
    if (geminiSetup?.systemInstruction?.parts) {
      const textParts = geminiSetup.systemInstruction.parts
        .filter((part: any) => part.text)
        .map((part: any) => part.text);
      if (textParts.length > 0) {
        instructions = textParts.join(' ');
      }
    }

    // Transform tools if present
    const oaiTools = geminiSetup?.tools ? transformGeminiToolsToOAI(geminiSetup.tools) : undefined;

    const sessionPayload: any = {
      modalities: ["text", "audio"],
      turn_detection: { type: "server_vad", silence_duration_ms: 700 },
      voice: "ash",
      input_audio_transcription: { model: "whisper-1" },
      input_audio_format: "pcm16",
      output_audio_format: "pcm16",
      instructions: instructions
    };

    // Add tools if they exist
    if (oaiTools && oaiTools.length > 0) {
      sessionPayload.tools = oaiTools;
    }

    const transformedEvent: ProvidersEvent = {
      src: Providers.OPENAI,
      payload: {
        type: "session.update",
        session: sessionPayload
      }
    };
    this.emitEvent(transformedEvent);
  }

  toolResponse(event: ProvidersEvent): void {
    // Transform Gemini toolResponse to OAI conversation.item.create format
    // Input: { toolResponse: { functionResponses: [{ id, name, response }] } }
    // Output: { type: "conversation.item.create", item: { type: "function_call_output", call_id, output } }
    
    const functionResponses = event.payload?.toolResponse?.functionResponses;
    if (!functionResponses || !Array.isArray(functionResponses)) return;

    // Transform each function response to OAI format
    for (const funcResponse of functionResponses) {
      const transformedEvent: ProvidersEvent = {
        src: Providers.OPENAI,
        payload: {
          type: "conversation.item.create",
          item: {
            type: "function_call_output",
            call_id: funcResponse.id,  // id → call_id
            output: JSON.stringify(funcResponse.response)  // object → JSON string
          }
        }
      };
      this.emitEvent(transformedEvent);
    }

    // Trigger response generation after function responses (required by OpenAI)
    this.emitEvent({
      src: Providers.OPENAI,
      payload: {
        type: "response.create"
      }
    });
  }
}