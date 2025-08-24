import fs from 'fs';
import path from 'path';
import GeminiEventManager from '../src/GeminiEventManager';
import { EventManager, Providers, ProvidersEvent, Config, ConfigKeys } from '@realtime-switch/core';
import dotenv from 'dotenv';

function convertWavToPcm(wavBuffer: Buffer): Buffer {
  // Skip WAV header (44 bytes) to get raw PCM data
  // WAV format: RIFF header (12) + fmt chunk (24) + data chunk header (8) = 44 bytes
  const pcmData = wavBuffer.slice(44);
  return pcmData;
}

dotenv.config();

// Helper function to get tool definitions
function getToolDefinitions() {
  return [{
    functionDeclarations: [{
      name: "get_temperature",
      //  behavior: "NON_BLOCKING",
      description: "Get the current temperature for a given city",
      parameters: {
        type: "OBJECT",
        properties: {
          city: {
            type: "STRING",
            description: "The name of the city"
          }
        },
        required: ["city"]
      }
    }, {
      name: "get_forecast",
      //   behavior: "NON_BLOCKING",
      description: "Get the weather forecast for a given city",
      parameters: {
        type: "OBJECT",
        properties: {
          city: {
            type: "STRING",
            description: "The name of the city"
          }
        },
        required: ["city"]
      }
    }]
  }];
}

// Helper function to send tool response
async function sendToolResponse(geminiDirect: GeminiEventManager, baseliner: GeminiFunctionCallBaseline) {
  // Check if we captured a function call and respond to it
  if (baseliner.functionCallId && baseliner.functionName) {
    console.log(`[GeminiFunctionCallBaseline] Responding to function call: ${baseliner.functionName} with ID: ${baseliner.functionCallId}`);

    // Prepare response based on function name
    let responseData;
    if (baseliner.functionName === "get_temperature") {
      responseData = {
        temperature: 22,
        unit: "celsius",
        city: "Toronto"
      };
    } else if (baseliner.functionName === "get_forecast") {
      responseData = {
        forecast: "Sunny with a chance of clouds",
        temperature: "20-25°C",
        city: "Toronto"
      };
    } else {
      responseData = {
        result: "Unknown function"
      };
    }

    console.log('[GeminiFunctionCallBaseline] Sending function response...');
    geminiDirect.receiveEvent({
      src: Providers.GEMINI,
      payload: {
        toolResponse: {
          functionResponses: [{
            id: baseliner.functionCallId,
            name: baseliner.functionName,
            response: responseData
          }]
        }
      }
    });

    // Reset for potential next function call
    baseliner.functionCallId = null;
    baseliner.functionName = null;

    // Wait for potential next function call
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Check if another function call was made (for sequential calls)
    if (baseliner.functionCallId && baseliner.functionName) {
      console.log(`[GeminiFunctionCallBaseline] Responding to second function call: ${baseliner.functionName} with ID: ${baseliner.functionCallId}`);

      // Prepare response based on function name
      let responseData;
      if (baseliner.functionName === "get_temperature") {
        responseData = {
          temperature: 22,
          unit: "celsius",
          city: "Toronto"
        };
      } else if (baseliner.functionName === "get_forecast") {
        responseData = {
          forecast: "Sunny with a chance of clouds",
          temperature: "20-25°C",
          city: "Toronto"
        };
      } else {
        responseData = {
          result: "Unknown function"
        };
      }

      console.log('[GeminiFunctionCallBaseline] Sending second function response...');
      geminiDirect.receiveEvent({
        src: Providers.GEMINI,
        payload: {
          toolResponse: {
            functionResponses: [{
              id: baseliner.functionCallId,
              name: baseliner.functionName,
              response: responseData
            }]
          }
        }
      });

      // Wait for final response after function call
      await new Promise(resolve => setTimeout(resolve, 10000));
    } else {
      console.log('[GeminiFunctionCallBaseline] No second function call captured');
    }
  } else {
    console.log('[GeminiFunctionCallBaseline] No function call captured, skipping response');
  }
}

class GeminiFunctionCallBaseline extends EventManager {
  public logFile: string;
  public functionCallId: string | null = null;
  public functionName: string | null = null;

  constructor() {
    super();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const logsDir = path.join(process.cwd(), 'test/.logs');
    
    // Create .logs directory if it doesn't exist
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    
    this.logFile = path.join(logsDir, `baseline-function-call-${timestamp}.log`);
    // Create new log file
    fs.writeFileSync(this.logFile, '');

    // Create last-run.txt for freshness checking
    const lastRunFile = path.join(process.cwd(), 'test/last-run-function-call.txt');
    fs.writeFileSync(lastRunFile, new Date().toISOString());
  }

  // Method to chunk and send audio in multiple parts
  async chunkAndSend(geminiDirect: GeminiEventManager, base64Audio: string, chunkSize: number = 32088): Promise<void> {
    console.log('[GeminiFunctionCallBaseline] Starting chunked audio send...');
    console.log(`[GeminiFunctionCallBaseline] Total audio length: ${base64Audio.length} characters`);

    // Break into chunks
    const chunks = [];
    for (let i = 0; i < base64Audio.length; i += chunkSize) {
      chunks.push(base64Audio.slice(i, i + chunkSize));
    }

    console.log(`[GeminiFunctionCallBaseline] Sending ${chunks.length} audio chunks...`);

    // Send chunks with small delays
    for (let i = 0; i < chunks.length; i++) {
      console.log(`[GeminiFunctionCallBaseline] Sending chunk ${i + 1}/${chunks.length} (${chunks[i].length} characters)...`);

      geminiDirect.receiveEvent({
        src: Providers.GEMINI,
        payload: {
          realtimeInput: {
            audio: {
              mimeType: "audio/pcm;rate=24000",
              data: chunks[i]
            }
          }
        }
      });

      // Small delay between chunks (similar to ElevenLabs implementation)
      if (i < chunks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    console.log('[GeminiFunctionCallBaseline] All audio chunks sent successfully');
  }

  receiveEvent(event: ProvidersEvent): void {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${JSON.stringify(event)}\n`;

    console.log(`[GeminiFunctionCallBaseline] Event received:`, event);
    fs.appendFileSync(this.logFile, logEntry);

    // Capture function call ID and name
    if (event.payload?.toolCall?.functionCalls?.[0]) {
      this.functionCallId = event.payload.toolCall.functionCalls[0].id;
      this.functionName = event.payload.toolCall.functionCalls[0].name;
      console.log(`[GeminiFunctionCallBaseline] Captured function call: ${this.functionName} with ID: ${this.functionCallId}`);
    }
  }
}

async function runFunctionCallBaseline() {
  // Control flag for enabling/disabling tools and tool responses
  const enableTools = true; // Set to true to enable tools, false to disable

  // Initialize config to use GEMINI_API_KEY from config system
  const config = Config.getInstance();
  const geminiKey = config.get(ConfigKeys.GEMINI_API_KEY);
  if (!geminiKey) {
    throw new Error('GEMINI_API_KEY not found in config');
  }

  console.log('[GeminiFunctionCallBaseline] Starting function call baseline test...');
  console.log(`[GeminiFunctionCallBaseline] Tools enabled: ${enableTools}`);

  const sessionId = `function-call-test-${Date.now()}`;
  const geminiDirect = new GeminiEventManager(sessionId);
  const baseliner = new GeminiFunctionCallBaseline();

  geminiDirect.addSubscribers(baseliner);

  console.log('[GeminiFunctionCallBaseline] Waiting for connection...');
  // Wait for connection
  await new Promise(resolve => setTimeout(resolve, 3000));

  console.log(`[GeminiFunctionCallBaseline] Connected: ${geminiDirect.isConnected()}`);

  if (geminiDirect.isConnected()) {
    console.log('[GeminiFunctionCallBaseline] Connection established, sending setup with tools...');

    // Send setup message with tool definition
    console.log('[GeminiFunctionCallBaseline] Sending setup message with get_temperature and get_key tools...');
    geminiDirect.receiveEvent({
      src: Providers.GEMINI,
      payload: {
        setup: {
          model: "models/gemini-2.0-flash-live-001",
          realtimeInputConfig: {
            automaticActivityDetection: {
              disabled: false, // default
              endOfSpeechSensitivity: "END_SENSITIVITY_HIGH"

            }
          },
          generationConfig: {
            responseModalities: ["AUDIO"]
          },
          outputAudioTranscription: {},
          inputAudioTranscription: {},
          systemInstruction: {
            parts: [{
              text: "You are a helpful assistant. When someone asks about weather, call temprature and forecast function to share a weather summary"
            }]
          },
          ...(enableTools ? { tools: getToolDefinitions() } : {})
        }
      }
    });

    // Wait for setup complete response
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Load and send test audio asking for weather
    const audioPath = path.join(process.cwd(), 'test/assets/blue-get-weather.wav');
    if (fs.existsSync(audioPath)) {
      console.log('[GeminiFunctionCallBaseline] Sending audio file asking for weather...');
      const audioBuffer = fs.readFileSync(audioPath);

      // Convert WAV to PCM if it's a WAV file
      const isWavFile = audioPath.endsWith('.wav');
      const pcmBuffer = isWavFile ? convertWavToPcm(audioBuffer) : audioBuffer;

      // Convert PCM buffer to base64 string for Gemini API
      const base64Audio = pcmBuffer.toString('base64');

      console.log('[GeminiFunctionCallBaseline] Using chunked audio send...');
      await baseliner.chunkAndSend(geminiDirect, base64Audio);

      console.log('[GeminiFunctionCallBaseline] Chunked audio sent, waiting for function call response...');

      // Wait for function call to be generated
      await new Promise(resolve => setTimeout(resolve, 10000));

      // Send tool response if function call was made and tools are enabled
      if (enableTools) {
        await sendToolResponse(geminiDirect, baseliner);
      }
    } else {
      console.log('[GeminiFunctionCallBaseline] Audio file not found at:', audioPath);
      console.log('[GeminiFunctionCallBaseline] Please ensure blue-get-weather.wav exists in test/assets/');
      return;
    }

  } else {
    console.error('[GeminiFunctionCallBaseline] Failed to establish connection');
  }

  console.log('[GeminiFunctionCallBaseline] Test complete, cleaning up...');
  geminiDirect.cleanup();

  console.log(`[GeminiFunctionCallBaseline] Log file created: ${baseliner.logFile}`);
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('[GeminiFunctionCallBaseline] Received SIGINT, exiting...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('[GeminiFunctionCallBaseline] Received SIGTERM, exiting...');
  process.exit(0);
});

runFunctionCallBaseline().catch(error => {
  console.error('❌ Function call baseline test failed:', error);
  process.exit(1);
});