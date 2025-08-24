import fs from 'fs';
import path from 'path';
import GeminiEventManager from '../src/GeminiEventManager';
import { EventManager, Providers, ProvidersEvent, Config, ConfigKeys } from '@realtime-switch/core';
import dotenv from 'dotenv';

dotenv.config();

class GeminiToolCallBaseline extends EventManager {
  public logFile: string;

  constructor() {
    super();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const logsDir = path.join(process.cwd(), 'test/.logs');
    
    // Create .logs directory if it doesn't exist
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    
    this.logFile = path.join(logsDir, `tool-call-baseline-events-${timestamp}.log`);
    // Create new log file
    fs.writeFileSync(this.logFile, '');
    
    // Create last-run.txt for freshness checking
    const lastRunFile = path.join(process.cwd(), 'test/tool-call-last-run.txt');
    fs.writeFileSync(lastRunFile, new Date().toISOString());
  }

  receiveEvent(event: ProvidersEvent): void {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${JSON.stringify(event)}\n`;
    
    console.log(`[GeminiToolCallBaseline] Event received:`, event);
    fs.appendFileSync(this.logFile, logEntry);
  }
}

async function runToolCallBaseline() {
  // Initialize config to use GEMINI_API_KEY from config system
  const config = Config.getInstance();
  const geminiKey = config.get(ConfigKeys.GEMINI_API_KEY);
  if (!geminiKey) {
    throw new Error('GEMINI_API_KEY not found in config');
  }

  console.log('[GeminiToolCallBaseline] Starting tool call baseline test...');
  
  const sessionId = `tool-call-test-${Date.now()}`;
  const gemini = new GeminiEventManager(sessionId);
  const baseliner = new GeminiToolCallBaseline();

  gemini.addSubscribers(baseliner);

  console.log('[GeminiToolCallBaseline] Waiting for connection and setup...');
  // Wait for connection and setup to complete
  await new Promise(resolve => setTimeout(resolve, 3000));

  console.log(`[GeminiToolCallBaseline] Connected: ${gemini.isConnected()}`);
  
  if (gemini.isConnected()) {
    console.log('[GeminiToolCallBaseline] Sending setup with tool definition...');
    
    // Send setup with get_temperature tool definition (Gemini format)
    gemini.receiveEvent({
      src: Providers.GEMINI,
      payload: {
        setup: {
          model: "models/gemini-2.0-flash-exp",
          generationConfig: {
            responseModalities: ["AUDIO"]
          },
          outputAudioTranscription: {},
          inputAudioTranscription: {},
          systemInstruction: {
            parts: [{ 
              text: "You are a helpful assistant. When asked about weather or temperature, use the get_temperature function."
            }]
          },
          tools: [{
            functionDeclarations: [{
              name: "get_temperature",
              description: "Get the current temperature for a specified city",
              parameters: {
                type: "OBJECT",
                properties: {
                  city: {
                    type: "STRING",
                    description: "The name of the city to get temperature for"
                  },
                  unit: {
                    type: "STRING",
                    enum: ["celsius", "fahrenheit"], 
                    description: "Temperature unit to return"
                  }
                },
                required: ["city"]
              }
            }]
          }]
        }
      }
    });

    console.log('[GeminiToolCallBaseline] Waiting after setup...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log('[GeminiToolCallBaseline] Sending tool call trigger message...');
    
    // Send realtime input that should trigger the tool call
    gemini.receiveEvent({
      src: Providers.GEMINI,
      payload: {
        realtimeInput: {
          text: "What's the temperature in Toronto right now?"
        }
      }
    });

    console.log('[GeminiToolCallBaseline] Waiting for tool call events...');
    // Wait longer for responses (Gemini might take more time to process tool calls)
    await new Promise(resolve => setTimeout(resolve, 15000));

    console.log('[GeminiToolCallBaseline] Testing alternative trigger...');
    
    // Alternative: Try with a more explicit message about temperature
    await new Promise(resolve => setTimeout(resolve, 1000));
    gemini.receiveEvent({
      src: Providers.GEMINI,
      payload: {
        realtimeInput: {
          text: "Can you tell me the current weather temperature in New York? Please use the temperature function."
        }
      }
    });

    console.log('[GeminiToolCallBaseline] Waiting for additional responses...');
    await new Promise(resolve => setTimeout(resolve, 10000));

  } else {
    console.error('[GeminiToolCallBaseline] Failed to establish connection');
  }

  console.log('[GeminiToolCallBaseline] Test complete, cleaning up...');
  gemini.cleanup();
  
  console.log(`[GeminiToolCallBaseline] Log file created: ${baseliner.logFile}`);
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('[GeminiToolCallBaseline] Received SIGINT, exiting...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('[GeminiToolCallBaseline] Received SIGTERM, exiting...');
  process.exit(0);
});

runToolCallBaseline().catch(error => {
  console.error('❌ Gemini Tool Call baseline test failed:', error);
  process.exit(1);
});