import { ProvidersEvent, ServerEventTransformer, ServerEventsExtractor, Providers } from '@realtime-switch/core';

export class ServerOAIGeminiTransformer extends ServerEventTransformer {
  private userConvId: string | null = null;

  constructor(extractor: ServerEventsExtractor) {
    super(extractor);
  }

  receiveEvent(event: ProvidersEvent): void {
    const eventType = event.payload?.type;

    // Track user conversation item ID
    if (eventType === 'conversation.item.created') {
      const item = event.payload?.item;
      if (item?.role === 'user') {
        this.userConvId = item.id;
      }
    }

    this.extractor?.extract(event);
  }

  userTranscript(event: ProvidersEvent): void {
    const eventType = event.payload?.type;

    if (eventType === 'conversation.item.input_audio_transcription.delta') {
      const delta = event.payload?.delta;
      const itemId = event.payload?.item_id || this.userConvId;

      if (delta) {
        this.emitEvent({
          src: Providers.GEMINI,
          payload: {
            serverContent: {
              inputTranscription: { text: delta },
              convId: itemId  // Add the conversation item ID
            }
          }
        });
      }
    }
  }

  responseTranscript(event: ProvidersEvent): void {
    const eventType = event.payload?.type;

    if (eventType === 'response.audio_transcript.delta') {
      const delta = event.payload?.delta;
      if (delta) {
        // Just pass through the delta - no accumulation needed
        this.emitEvent({
          src: Providers.GEMINI,
          payload: {
            serverContent: {
              outputTranscription: { text: delta }
            }
          }
        });
      }
    }
    // Ignore transcript.done events - no action needed
  }

  responseAudio(event: ProvidersEvent): void {
    const eventType = event.payload?.type;

    if (eventType === 'response.audio.delta') {
      const audioDelta = event.payload?.delta;
      if (audioDelta) {
        // Convert OpenAI audio delta to Gemini modelTurn format
        this.emitEvent({
          src: Providers.GEMINI,
          payload: {
            serverContent: {
              modelTurn: {
                parts: [{
                  inlineData: { data: audioDelta }
                }]
              }
            }
          }
        });
      }
    }
    // Note: response.audio.done doesn't need special handling as it's a wrapper event
  }

  toolCall(event: ProvidersEvent): void {
    const eventType = event.payload?.type;

    if (eventType === 'response.output_item.done') {
      const item = event.payload?.item;
      if (item?.type === 'function_call') {
        // Transform immediately to Gemini format - no accumulation needed
        try {
          const args = item.arguments ? JSON.parse(item.arguments) : {};
          console.log(`[ServerOAIGeminiTransformer] Converting OpenAI function call to Gemini format: ${item.name} (${item.call_id})`);
          
          this.emitEvent({
            src: Providers.GEMINI,
            payload: {
              toolCall: {
                functionCalls: [{
                  id: item.call_id,        // call_id → id
                  name: item.name,
                  args: args               // JSON string → object
                }]
              }
            }
          });
        } catch (error) {
          console.error('[ServerOAIGeminiTransformer] Failed to parse function call arguments:', error);
        }
      }
    }
  }

  turn(event: ProvidersEvent): void {
    const eventType = event.payload?.type;

    if (eventType === 'response.done') {
      // Emit completion status directly - no function call accumulation needed
      const responseStatus = event.payload?.response?.status;
      const isInterrupted = responseStatus === 'cancelled';

      if (isInterrupted) {
        // Emit interrupted instead of generationComplete
        this.emitEvent({
          src: Providers.GEMINI,
          payload: {
            serverContent: {
              interrupted: true
            }
          }
        });
      } else {
        // Normal completion - emit generationComplete
        this.emitEvent({
          src: Providers.GEMINI,
          payload: {
            serverContent: {
              generationComplete: true
            }
          }
        });
      }

      // Always emit turnComplete after
      this.emitEvent({
        src: Providers.GEMINI,
        payload: {
          serverContent: {
            turnComplete: true,
            prevConvId: this.userConvId
          }
        }
      });

      // Don't reset userConvId here - transcription might arrive after response.done
      // It will be overwritten when next user conversation item is created
    }
  }

  internalStats(event: ProvidersEvent): void {
    // Empty - internal stats are not real events and should not pass through
  }
}