import fs from 'fs';
import path from 'path';
import { EventManager, ProvidersEvent, Config, ConfigKeys, Providers } from '@realtime-switch/core';
import { Pipeline } from '../../src/Pipeline';
import dotenv from 'dotenv';

function convertWavToPcm(wavBuffer: Buffer): Buffer {
  // Skip WAV header (44 bytes) to get raw PCM data
  // WAV format: RIFF header (12) + fmt chunk (24) + data chunk header (8) = 44 bytes
  const pcmData = wavBuffer.slice(44);
  return pcmData;
}

dotenv.config();

class PipelineTestGeminiOAI extends EventManager {
  public logFile: string;
  public eventSummary: { [key: string]: number } = {};

  constructor() {
    super();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.logFile = path.join(process.cwd(), `test/pipeline-tests/pipeline-test-gemini-oai-${timestamp}.log`);
    // Create new log file
    fs.writeFileSync(this.logFile, '');
  }

  receiveEvent(event: ProvidersEvent): void {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${JSON.stringify(event)}\n`;

    console.log(`[PipelineTestGeminiOAI] Event received:`, event);
    fs.appendFileSync(this.logFile, logEntry);

    // Track event types for summary
    const eventType = (event as any).type || 'unknown';
    this.eventSummary[eventType] = (this.eventSummary[eventType] || 0) + 1;
  }
}

export async function runPipelineTestGeminiOAI() {
  // Initialize config to use OPENAI_API_KEY from config system
  const config = Config.getInstance();
  const openaiKey = config.get(ConfigKeys.OPENAI_API_KEY);
  if (!openaiKey) {
    throw new Error('OPENAI_API_KEY not found in config');
  }

  console.log('[PipelineTestGeminiOAI] Starting pipeline test (API Style: GEMINI, Provider: OPENAI)...');
  console.log('[PipelineTestGeminiOAI] This tests reverse cross-provider transformation...');

  const sessionId = `pipeline-test-gemini-oai-${Date.now()}`;
  const mockClientSocket = new PipelineTestGeminiOAI();
  
  // Create Pipeline: apiStyle=GEMINI, provider=OPENAI (reverse transformation)
  const pipeline = new Pipeline(Providers.GEMINI, sessionId, mockClientSocket, Providers.OPENAI);

  console.log('[PipelineTestGeminiOAI] Pipeline created, waiting for provider connection...');
  
  // Wait for provider to connect and setup to complete
  await new Promise(resolve => setTimeout(resolve, 5000));

  console.log('[PipelineTestGeminiOAI] Simulating Gemini setup message...');
  
  // Send Gemini format setup message
  const setupMessage = {
    setup: {
      model: "models/gemini-2.0-flash-live-001",
      generationConfig: {
        responseModalities: ["AUDIO"]
      },
      outputAudioTranscription: {},
      inputAudioTranscription: {},
      systemInstruction: {
        parts: [{ text: "Talk to user" }]
      }
    }
  };
  
  pipeline.receiveEvent(setupMessage);
  console.log('[PipelineTestGeminiOAI] Setup message sent, waiting for setup complete...');

  // Wait for setup to complete
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Load and send test audio if available
  const audioPath = path.join('../implementations/providers/gemini/test/assets/say-the-word-blue.wav');
  if (fs.existsSync(audioPath)) {
    console.log('[PipelineTestGeminiOAI] Sending test audio through pipeline...');
    const audioBuffer = fs.readFileSync(audioPath);

    // Convert WAV to PCM if it's a WAV file
    const isWavFile = audioPath.endsWith('.wav');
    const pcmBuffer = isWavFile ? convertWavToPcm(audioBuffer) : audioBuffer;

    // Convert to base64 like the HTML client does
    const uint8Array = new Uint8Array(pcmBuffer);
    const base64Audio = Buffer.from(uint8Array).toString('base64');

    // Send audio through pipeline (Gemini format with realtimeInput and mimeType)
    const audioEvent = {
      realtimeInput: {
        audio: {
          data: base64Audio,
          mimeType: "audio/pcm;rate=24000"
        }
      }
    };

    console.log('[PipelineTestGeminiOAI] Sending realtimeInput with audio...');
    pipeline.receiveEvent(audioEvent);

    console.log('[PipelineTestGeminiOAI] Audio sent, waiting for responses...');
    
    // Wait for responses and observe the event flow
    await new Promise(resolve => setTimeout(resolve, 15000));
    
  } else {
    console.log('[PipelineTestGeminiOAI] No audio file found, skipping audio test...');
    console.log(`[PipelineTestGeminiOAI] Looked for: ${audioPath}`);
  }

  console.log('[PipelineTestGeminiOAI] Test complete, cleaning up...');
  pipeline.cleanup();

  console.log(`[PipelineTestGeminiOAI] Log file created: ${mockClientSocket.logFile}`);
  
  // Show a summary of events received
  const logContent = fs.readFileSync(mockClientSocket.logFile, 'utf-8');
  const lines = logContent.split('\n').filter(line => line.trim());
  console.log(`[PipelineTestGeminiOAI] Total events received: ${lines.length}`);
  
  // Count Gemini-specific events
  const generationCompleteCount = lines.filter(line => line.includes('generationComplete')).length;
  const turnCompleteCount = lines.filter(line => line.includes('turnComplete')).length;
  const serverContentCount = lines.filter(line => line.includes('serverContent')).length;
  
  console.log(`[PipelineTestGeminiOAI] Gemini-specific event summary:`);
  console.log(`  - generationComplete events: ${generationCompleteCount}`);
  console.log(`  - turnComplete events: ${turnCompleteCount}`);
  console.log(`  - serverContent events: ${serverContentCount}`);

  console.log(`[PipelineTestGeminiOAI] All event summary:`);
  Object.entries(mockClientSocket.eventSummary).forEach(([eventType, count]) => {
    console.log(`  - ${eventType}: ${count}`);
  });

  return {
    combination: 'Gemini API Style + OpenAI Provider',
    totalEvents: lines.length,
    eventSummary: mockClientSocket.eventSummary,
    geminiSpecificEvents: {
      generationComplete: generationCompleteCount,
      turnComplete: turnCompleteCount,
      serverContent: serverContentCount
    },
    logFile: mockClientSocket.logFile
  };
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('[PipelineTestGeminiOAI] Received SIGINT, exiting...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('[PipelineTestGeminiOAI] Received SIGTERM, exiting...');
  process.exit(0);
});

// Run if called directly
if (require.main === module) {
  runPipelineTestGeminiOAI().catch(error => {
    console.error('❌ Pipeline test GeminiOAI failed:', error);
    process.exit(1);
  });
}