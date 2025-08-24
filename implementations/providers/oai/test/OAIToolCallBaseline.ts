import fs from 'fs';
import path from 'path';
import OAIEventManager from '../src/OAIEventManager';
import { EventManager, Providers, ProvidersEvent } from '@realtime-switch/core';
import { FreshnessChecker } from './utils/freshness-checker';
import dotenv from 'dotenv';

dotenv.config();

class OAIToolCallBaseline extends EventManager {
  private logFile: string;

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
  }

  getLogFile(): string {
    return this.logFile;
  }

  receiveEvent(data: ProvidersEvent): void {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${JSON.stringify(data)}\n`;
    
    console.log(`[OAIToolCallBaseline] Event received:`, data);
    fs.appendFileSync(this.logFile, logEntry);
  }
}

async function runToolCallBaseline() {
  // Get key from env
  const oaiKey = process.env.OPENAI_API_KEY;
  if (!oaiKey) {
    throw new Error('OPENAI_API_KEY not found in environment');
  }

  console.log('[OAIToolCallBaseline] Starting tool call baseline test...');

  const oai = new OAIEventManager();
  const baseliner = new OAIToolCallBaseline();
  oai.addSubscribers(baseliner);

  console.log('[OAIToolCallBaseline] Waiting for connection...');
  // Wait for WebSocket connection to establish
  await new Promise(resolve => setTimeout(resolve, 2000));

  console.log('[OAIToolCallBaseline] Sending session update with tool definition...');
  
  // Send session update with get_temperature tool definition (OpenAI format)
  oai.receiveEvent({
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
        instructions: "You are a helpful assistant. When asked about weather or temperature, use the get_temperature function.",
        tools: [{
          type: "function",
          name: "get_temperature",
          description: "Get the current temperature for a specified city",
          parameters: {
            type: "object",
            properties: {
              city: {
                type: "string",
                description: "The name of the city to get temperature for"
              },
              unit: {
                type: "string", 
                enum: ["celsius", "fahrenheit"],
                description: "Temperature unit to return",
                default: "celsius"
              }
            },
            required: ["city"]
          },
          strict: false
        }]
      }
    }
  });

  console.log('[OAIToolCallBaseline] Sending tool call trigger message...');

  // Wait a moment after session update
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Send a conversation item that should trigger the tool call
  oai.receiveEvent({
    src: Providers.OPENAI,
    payload: {
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [{
          type: "input_text",
          text: "What's the temperature in Toronto right now?"
        }]
      }
    }
  });

  console.log('[OAIToolCallBaseline] Creating response to trigger tool call...');

  // Trigger response generation
  oai.receiveEvent({
    src: Providers.OPENAI,
    payload: {
      type: "response.create",
      response: {
        modalities: ["text", "audio"],
        instructions: "Use the get_temperature function to answer the user's question about Toronto's temperature."
      }
    }
  });

  console.log('[OAIToolCallBaseline] Waiting for tool call events...');

  // Wait for tool call events to be generated
  await new Promise(resolve => setTimeout(resolve, 10000));

  console.log('[OAIToolCallBaseline] Test complete, cleaning up...');
  oai.cleanup();
  
  // Update the last-run.txt file to indicate when baseline was last executed
  const testAssetsDir = path.join(process.cwd(), 'test/assets');
  FreshnessChecker.updateLastRun(testAssetsDir);
  
  console.log(`[OAIToolCallBaseline] Baseline run completed. Log file created: ${baseliner.getLogFile()}`);
  console.log('[OAIToolCallBaseline] Last-run.txt updated for tool call baseline');
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('[OAIToolCallBaseline] Received SIGINT, exiting...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('[OAIToolCallBaseline] Received SIGTERM, exiting...');
  process.exit(0);
});

runToolCallBaseline().catch(error => {
  console.error('❌ OAI Tool Call baseline test failed:', error);
  process.exit(1);
});