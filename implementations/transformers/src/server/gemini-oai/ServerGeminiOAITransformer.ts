import { ProvidersEvent, ServerEventTransformer, ServerEventsExtractor, Providers } from '@realtime-switch/core';

export class ServerGeminiOAITransformer extends ServerEventTransformer {
  constructor(extractor: ServerEventsExtractor) {
    super(extractor);
  }

  receiveEvent(event: ProvidersEvent): void {
    this.extractor?.extract(event);
  }

  userTranscript(event: ProvidersEvent): void {
    const geminiText = event.payload?.serverContent?.inputTranscription?.text;
    if (!geminiText) return;

    // Direct mapping - no pseudo events
    this.emitEvent({
      src: Providers.OPENAI,
      payload: {
        type: "conversation.item.input_audio_transcription.delta",
        content_index: 0,
        delta: geminiText
      }
    });
  }

  responseTranscript(event: ProvidersEvent): void {
    const transcriptText = event.payload?.serverContent?.outputTranscription?.text;
    if (transcriptText) {
      this.emitEvent({
        src: Providers.OPENAI,
        payload: {
          type: "response.audio_transcript.delta",
          output_index: 0,
          content_index: 0,
          delta: transcriptText
        }
      });
    }
  }

  responseAudio(event: ProvidersEvent): void {
    const modelTurn = event.payload?.serverContent?.modelTurn;
    if (!modelTurn?.parts) return;

    // Direct mapping - no pseudo events
    // Iterate through parts array and generate audio deltas
    for (const part of modelTurn.parts) {
      if (part.inlineData?.data) {
        this.emitEvent({
          src: Providers.OPENAI,
          payload: {
            type: "response.audio.delta",
            output_index: 0,
            content_index: 0,
            delta: part.inlineData.data
          }
        });
      }
    }
  }

  toolCall(event: ProvidersEvent): void {
    const functionCalls = event.payload?.toolCall?.functionCalls;
    if (!functionCalls || !Array.isArray(functionCalls)) return;

    // Transform each function call to OAI response.output_item.done format immediately
    // No accumulation or waiting for response.done - emit each function call right away
    for (const funcCall of functionCalls) {
      console.log(`[ServerGeminiOAITransformer] Converting Gemini toolCall to OpenAI format: ${funcCall.name} (${funcCall.id})`);
      this.emitEvent({
        src: Providers.OPENAI,
        payload: {
          type: "response.output_item.done",
          output_index: 0,
          item: {
            id: `item_${funcCall.id}`,
            object: "realtime.item",
            type: "function_call",
            status: "completed",
            name: funcCall.name,
            call_id: funcCall.id,
            arguments: JSON.stringify(funcCall.args || {})  // object → JSON string
          }
        }
      });
    }
  }

  turn(event: ProvidersEvent): void {
    const serverContent = event.payload?.serverContent;
    const isGenerationComplete = serverContent?.generationComplete;
    const isInterrupted = serverContent?.interrupted;
    
    // Only emit response.done - no pseudo events
    const responseStatus = isInterrupted ? "cancelled" : "completed";
    const statusDetails = isInterrupted ? 
      { type: "cancelled", reason: "turn_detected" } : null;
    
    this.emitEvent({
      src: Providers.OPENAI,
      payload: {
        type: "response.done",
        response: {
          object: "realtime.response",
          status: responseStatus,
          status_details: statusDetails,
          output: [],
          modalities: ["text", "audio"],
          output_audio_format: "pcm16",
          temperature: 0.8,
          max_output_tokens: "inf",
          usage: null,
          metadata: null
        }
      }
    });
  }
}