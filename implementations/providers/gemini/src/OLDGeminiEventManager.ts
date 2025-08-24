import { EventManager, ProvidersEvent, Providers, Config, ConfigKeys, ProviderConManager } from "@realtime-switch/core";
import { GoogleGenAI, Modality } from '@google/genai';
import { BaseCheckpoint } from '@realtime-switch/checkpoint';

export default class GeminiEventManager extends EventManager {
  private genai: GoogleGenAI;
  private session: any;
  private apiKey: string;
  private selfClosing: boolean = false;
  private sessionId: string;
  private connectionCallback?: () => void;

  constructor(sessionId: string, connectionCallback?: () => void) {
    super();
    this.sessionId = sessionId;
    this.connectionCallback = connectionCallback;

    const config = Config.getInstance();
    this.apiKey = config.get(ConfigKeys.GEMINI_API_KEY) || 'demo-key';

    // Initialize Google GenAI client
    this.genai = new GoogleGenAI({ apiKey: this.apiKey });

    // Connect immediately
    this.connectToGemini().catch(error => {
      console.error(error)
      // Connection failed
    });
  }

  private async connectToGemini() {
    try {
      const model = 'gemini-2.0-flash-live-001';

      // Load conversation history if available
      const conversationHistory = BaseCheckpoint.loadConversationHistory(this.sessionId);
      let systemText = "Talk to user.";

      if (conversationHistory) {
        systemText += " Here is the previous conversation history that you can use as context to continue: " + conversationHistory;
      }

      const config = {
        responseModalities: [Modality.AUDIO],
        outputAudioTranscription: {},
        inputAudioTranscription: {},
        systemInstruction: {
          parts: [{ text: systemText }]
        }
      };

      this.session = await this.genai.live.connect({
        model: model,
        callbacks: {
          onopen: () => {
            console.log("Gemini Connect Open")
            // Notify that provider is connected
            if (this.connectionCallback) {
              this.connectionCallback();
            }
          },
          onmessage: (message: any) => {
            // Pass through all messages like OAI
            this.emitEvent({ src: Providers.GEMINI, payload: message });
          },
          onerror: (error: any) => {
            console.error("Gemini Connect Failed", error)
          },
          onclose: (event: any) => {
            this.handleClose();
          }
        },
        config: config
      });
    } catch (error) {
      console.error("Gemini Connect Failed", error)
    }
  }

  receiveEvent(event: ProvidersEvent): void {
    if (this.session) {
      this.session.sendRealtimeInput(event.payload);
    }
  }

  private handleClose(): void {
    if (this.selfClosing) {
      // Self-initiated close, don't reconnect
      this.selfClosing = false;
      this.cleanup();
    } else {
      // Network-initiated close, attempt reconnection
      console.log('Gemini session closed unexpectedly, reconnecting...');
      setTimeout(() => {
        this.connectToGemini().catch(error => {
          // Reconnection failed
        });
      }, 1000);
    }
  }

  cleanup() {
    super.cleanup();
    this.selfClosing = true;
    if (this.session) {
      this.session.close();
    }
  }

  isConnected(): boolean {
    return this.session !== null && this.session !== undefined;
  }
}