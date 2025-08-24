import fs from 'fs';
import path from 'path';
import OAIEventManager from '../src/OAIEventManager';
import { EventManager, Providers, ProvidersEvent, Config, ConfigKeys } from '@realtime-switch/core';
import dotenv from 'dotenv';

function convertWavToPcm(wavBuffer: Buffer): Buffer {
  // Skip WAV header (44 bytes) to get raw PCM data
  // WAV format: RIFF header (12) + fmt chunk (24) + data chunk header (8) = 44 bytes
  const pcmData = wavBuffer.slice(44);
  return pcmData;
}

dotenv.config();

// Helper function to get tool definitions (OpenAI format)
function getToolDefinitions() {
  return [{
    type: "function",
    name: "get_temperature",
    description: "Get the current temperature for a given city",
    parameters: {
      type: "object",
      properties: {
        city: {
          type: "string",
          description: "The name of the city"
        }
      },
      required: ["city"]
    }
  }, {
    type: "function",
    name: "get_forecast",
    description: "Get the weather forecast for a given city",
    parameters: {
      type: "object",
      properties: {
        city: {
          type: "string",
          description: "The name of the city"
        }
      },
      required: ["city"]
    }
  }];
}

// Helper function to send tool response
async function sendToolResponse(oaiDirect: OAIEventManager, baseliner: OAIFunctionCallBaseline) {
  // Check if we captured a function call and respond to it
  if (baseliner.functionCallId && baseliner.functionName) {
    console.log(`[OAIFunctionCallBaseline] Responding to function call: ${baseliner.functionName} with ID: ${baseliner.functionCallId}`);

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

    console.log('[OAIFunctionCallBaseline] Sending function response...');
    oaiDirect.receiveEvent({
      src: Providers.OPENAI,
      payload: {
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: baseliner.functionCallId,
          output: JSON.stringify(responseData)
        }
      }
    });

    // Trigger response generation after function response (following docs)
    await new Promise(resolve => setTimeout(resolve, 500));
    console.log(`[OAIFunctionCallBaseline] Creating response after function response for ${baseliner.functionName}...`);
    oaiDirect.receiveEvent({
      src: Providers.OPENAI,
      payload: {
        type: "response.create"
      }
    });

    // Reset for potential next function call
    baseliner.functionCallId = null;
    baseliner.functionName = null;

    // Wait for potential next function call
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Check if another function call was made (for sequential calls)
    if (baseliner.functionCallId && baseliner.functionName) {
      console.log(`[OAIFunctionCallBaseline] Responding to second function call: ${baseliner.functionName} with ID: ${baseliner.functionCallId}`);

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

      console.log('[OAIFunctionCallBaseline] Sending second function response...');
      oaiDirect.receiveEvent({
        src: Providers.OPENAI,
        payload: {
          type: "conversation.item.create",
          item: {
            type: "function_call_output",
            call_id: baseliner.functionCallId,
            output: JSON.stringify(responseData)
          }
        }
      });

      // Trigger response generation after second function response (following docs)
      await new Promise(resolve => setTimeout(resolve, 500));
      console.log(`[OAIFunctionCallBaseline] Creating response after second function response for ${baseliner.functionName}...`);
      oaiDirect.receiveEvent({
        src: Providers.OPENAI,
        payload: {
          type: "response.create"
        }
      });

      // Wait for final response after function call
      await new Promise(resolve => setTimeout(resolve, 10000));
    } else {
      console.log('[OAIFunctionCallBaseline] No second function call captured');
    }
  } else {
    console.log('[OAIFunctionCallBaseline] No function call captured, skipping response');
  }
}

class OAIFunctionCallBaseline extends EventManager {
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
  async chunkAndSend(oaiDirect: OAIEventManager, base64Audio: string, chunkSize: number = 32088): Promise<void> {
    console.log('[OAIFunctionCallBaseline] Starting chunked audio send...');
    console.log(`[OAIFunctionCallBaseline] Total audio length: ${base64Audio.length} characters`);

    // Break into chunks
    const chunks = [];
    for (let i = 0; i < base64Audio.length; i += chunkSize) {
      chunks.push(base64Audio.slice(i, i + chunkSize));
    }

    console.log(`[OAIFunctionCallBaseline] Sending ${chunks.length} audio chunks...`);

    // Send chunks with small delays
    for (let i = 0; i < chunks.length; i++) {
      console.log(`[OAIFunctionCallBaseline] Sending chunk ${i + 1}/${chunks.length} (${chunks[i].length} characters)...`);

      oaiDirect.receiveEvent({
        src: Providers.OPENAI,
        payload: {
          type: "input_audio_buffer.append",
          audio: chunks[i]
        }
      });

      // Small delay between chunks (similar to Gemini implementation)
      if (i < chunks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    console.log('[OAIFunctionCallBaseline] All audio chunks sent successfully');
  }

  receiveEvent(event: ProvidersEvent): void {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${JSON.stringify(event)}\n`;

    console.log(`[OAIFunctionCallBaseline] Event received:`, event);
    fs.appendFileSync(this.logFile, logEntry);

    // Capture function call ID and name (OpenAI format)
    if (event.payload?.type === 'response.output_item.done' &&
      event.payload?.item?.type === 'function_call') {
      this.functionCallId = event.payload.item.call_id;
      this.functionName = event.payload.item.name;
      console.log(`[OAIFunctionCallBaseline] Captured function call: ${this.functionName} with ID: ${this.functionCallId}`);
    }
  }
}

async function runFunctionCallBaseline() {
  // Control flag for enabling/disabling tools and tool responses
  const enableTools = true; // Set to true to enable tools, false to disable

  // Initialize config to use OPENAI_API_KEY from config system
  const config = Config.getInstance();
  const openaiKey = config.get(ConfigKeys.OPENAI_API_KEY);
  if (!openaiKey) {
    throw new Error('OPENAI_API_KEY not found in config');
  }

  console.log('[OAIFunctionCallBaseline] Starting function call baseline test...');
  console.log(`[OAIFunctionCallBaseline] Tools enabled: ${enableTools}`);

  const oaiDirect = new OAIEventManager();
  const baseliner = new OAIFunctionCallBaseline();

  oaiDirect.addSubscribers(baseliner);

  console.log('[OAIFunctionCallBaseline] Waiting for connection...');
  // Wait for connection
  await new Promise(resolve => setTimeout(resolve, 3000));

  console.log(`[OAIFunctionCallBaseline] Connected: ${oaiDirect.isConnected()}`);

  if (oaiDirect.isConnected()) {
    console.log('[OAIFunctionCallBaseline] Connection established, sending setup with tools...');

    // Send session update with tool definition
    console.log('[OAIFunctionCallBaseline] Sending session update with get_temperature and get_forecast tools...');
    oaiDirect.receiveEvent({
      src: Providers.OPENAI,
      payload: {
        type: "session.update",
        session: {
          modalities: ["text", "audio"],
          turn_detection: { type: "server_vad", "silence_duration_ms": 700 },
          voice: "ash",
          input_audio_transcription: { model: "whisper-1", language: 'en' },
          input_audio_format: "pcm16",
          output_audio_format: "pcm16",
          instructions: "You are a helpful assistant. When someone asks about weather, call temperature and forecast function to share a weather summary",
          ...(enableTools ? { tools: getToolDefinitions() } : {})
        }
      }
    });

    // Wait for session update response
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Load and send test audio asking for weather
    const audioPath = path.join(process.cwd(), 'test/assets/get-toronto-weather.wav');
    if (fs.existsSync(audioPath)) {
      console.log('[OAIFunctionCallBaseline] Sending audio file asking for weather...');
      const audioBuffer = fs.readFileSync(audioPath);

      // Convert WAV to PCM if it's a WAV file
      const isWavFile = audioPath.endsWith('.wav');
      const pcmBuffer = isWavFile ? convertWavToPcm(audioBuffer) : audioBuffer;

      // Convert PCM buffer to base64 string for OpenAI API
      const base64Audio = pcmBuffer.toString('base64');

      console.log('[OAIFunctionCallBaseline] Using chunked audio send...');
      await baseliner.chunkAndSend(oaiDirect, base64Audio);

      console.log('[OAIFunctionCallBaseline] Chunked audio sent, waiting for function call response...');

      // Wait for function call to be generated
      await new Promise(resolve => setTimeout(resolve, 10000));

      // Send tool response if function call was made and tools are enabled
      if (enableTools) {
        await sendToolResponse(oaiDirect, baseliner);
      }
    } else {
      console.log('[OAIFunctionCallBaseline] Audio file not found at:', audioPath);
      console.log('[OAIFunctionCallBaseline] Please ensure get-temp-toronto.wav exists in test/assets/');
      return;
    }

    // // Follow the exact documentation example: send explicit text message + response.create
    // console.log('[OAIFunctionCallBaseline] Sending explicit text message asking for weather...');

    // // Create conversation item with text content (following docs example)
    // oaiDirect.receiveEvent({
    //   src: Providers.OPENAI,
    //   payload: {
    //     type: "conversation.item.create",
    //     item: {
    //       type: "message",
    //       role: "user",
    //       content: [
    //         {
    //           type: "input_text",
    //           text: "What is the weather like in Toronto? I need both the current temperature and forecast."
    //         }
    //       ]
    //     }
    //   }
    // });

    // // Wait a moment after creating the conversation item
    // await new Promise(resolve => setTimeout(resolve, 1000));

    // // Trigger response generation (following docs example)
    // console.log('[OAIFunctionCallBaseline] Creating response to trigger function calls...');
    // oaiDirect.receiveEvent({
    //   src: Providers.OPENAI,
    //   payload: {
    //     type: "response.create"
    //   }
    // });

    // console.log('[OAIFunctionCallBaseline] Response create sent, waiting for function calls...');

    // // Wait for function calls to be generated
    // await new Promise(resolve => setTimeout(resolve, 10000));

    // // Send tool response if function call was made and tools are enabled
    // if (enableTools) {
    //   await sendToolResponse(oaiDirect, baseliner);
    // }

  } else {
    console.error('[OAIFunctionCallBaseline] Failed to establish connection');
  }

  console.log('[OAIFunctionCallBaseline] Test complete, cleaning up...');
  oaiDirect.cleanup();

  console.log(`[OAIFunctionCallBaseline] Log file created: ${baseliner.logFile}`);
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('[OAIFunctionCallBaseline] Received SIGINT, exiting...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('[OAIFunctionCallBaseline] Received SIGTERM, exiting...');
  process.exit(0);
});

runFunctionCallBaseline().catch(error => {
  console.error('❌ Function call baseline test failed:', error);
  process.exit(1);
});