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

class PipelineTestGeminiGemini extends EventManager {
  public logFile: string;
  public eventSummary: { [key: string]: number } = {};

  constructor() {
    super();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.logFile = path.join(process.cwd(), `test/pipeline-tests/pipeline-test-gemini-gemini-${timestamp}.log`);
    // Create new log file
    fs.writeFileSync(this.logFile, '');

    // Create last-run.txt for comparison with direct test
    const lastRunFile = path.join(process.cwd(), 'test/last-run-pipeline-gemini-gemini.txt');
    fs.writeFileSync(lastRunFile, new Date().toISOString());
  }

  receiveEvent(event: ProvidersEvent): void {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${JSON.stringify(event)}\n`;

    console.log(`[PipelineTestGeminiGemini] Event received:`, event);
    fs.appendFileSync(this.logFile, logEntry);

    // Track event types for summary
    const eventType = (event as any).type || 'unknown';
    this.eventSummary[eventType] = (this.eventSummary[eventType] || 0) + 1;
  }
}

export async function runPipelineTestGeminiGemini() {
  try {
  // Initialize config to use GEMINI_API_KEY from config system
  const config = Config.getInstance();
  const geminiKey = config.get(ConfigKeys.GEMINI_API_KEY);
  if (!geminiKey) {
    throw new Error('GEMINI_API_KEY not found in config');
  }

  console.log('[PipelineTestGeminiGemini] Starting pipeline test (native Gemini)...');
  console.log('[PipelineTestGeminiGemini] This test uses: apiStyle=GEMINI, provider=GEMINI');

  const sessionId = `pipeline-test-${Date.now()}`;
  const mockClientSocket = new PipelineTestGeminiGemini();
  
  // Create Pipeline with native Gemini configuration
  // apiStyle=GEMINI (client expects Gemini format), provider=GEMINI (actual provider)
  const pipeline = new Pipeline(Providers.GEMINI, sessionId, mockClientSocket, Providers.GEMINI);

  console.log('[PipelineTestGeminiGemini] Pipeline created, waiting for provider connection...');
  
  // Wait for provider to connect and setup to complete
  await new Promise(resolve => setTimeout(resolve, 5000));

  console.log('[PipelineTestGeminiGemini] Simulating Gemini format setup message...');
  
  // Send Gemini format setup message
  const setupMessage = {
    setup: {
      model: "models/gemini-2.0-flash-live-001",
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: "Aoede"
            }
          }
        }
      },
      systemInstruction: {
        parts: [
          {
            text: "Talk to user"
          }
        ]
      }
    }
  };
  
  pipeline.receiveEvent(setupMessage);
  console.log('[PipelineTestGeminiGemini] Setup message sent, waiting for setupComplete...');

  // Wait for setup to complete
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Load and send test audio if available
  const audioPath = path.join('../implementations/providers/gemini/test/assets/say-the-word-blue.wav');
  if (fs.existsSync(audioPath)) {
    console.log('[PipelineTestGeminiGemini] Sending test audio in Gemini format...');
    const audioBuffer = fs.readFileSync(audioPath);

    // Convert WAV to PCM if it's a WAV file
    const isWavFile = audioPath.endsWith('.wav');
    const pcmBuffer = isWavFile ? convertWavToPcm(audioBuffer) : audioBuffer;

    // Convert to base64 for Gemini format
    const uint8Array = new Uint8Array(pcmBuffer);
    const base64Audio = Buffer.from(uint8Array).toString('base64');

    // Send audio in Gemini format (realtimeInput with mimeType)
    const audioEvent = {
      realtimeInput: {
        audio: {
          mimeType: "audio/pcm;rate=24000",
          data: base64Audio
        }
      }
    };

    console.log('[PipelineTestGeminiGemini] Sending realtimeInput with audio...');
    pipeline.receiveEvent(audioEvent);

    console.log('[PipelineTestGeminiGemini] Audio sent, waiting for responses...');
    
    // Wait for responses and observe the event flow
    await new Promise(resolve => setTimeout(resolve, 15000));
    
  } else {
    console.log('[PipelineTestGeminiGemini] No audio file found, skipping audio test...');
    console.log(`[PipelineTestGeminiGemini] Looked for: ${audioPath}`);
  }

  console.log('[PipelineTestGeminiGemini] Test complete, cleaning up...');
  pipeline.cleanup();

  console.log(`[PipelineTestGeminiGemini] Log file created: ${mockClientSocket.logFile}`);
  console.log(`[PipelineTestGeminiGemini] Native Gemini pipeline test completed!`);
  
  // Show a summary of events received
  const logContent = fs.readFileSync(mockClientSocket.logFile, 'utf-8');
  const lines = logContent.split('\n').filter(line => line.trim());
  console.log(`[PipelineTestGeminiGemini] Total events received: ${lines.length}`);
  
  // Count native Gemini event types
  const generationCompleteCount = lines.filter(line => line.includes('generationComplete')).length;
  const turnCompleteCount = lines.filter(line => line.includes('turnComplete')).length;
  const setupCompleteCount = lines.filter(line => line.includes('setupComplete')).length;
  const serverContentCount = lines.filter(line => line.includes('serverContent')).length;
  
  console.log(`[PipelineTestGeminiGemini] Native Gemini event summary:`);
  console.log(`  - setupComplete events: ${setupCompleteCount}`);
  console.log(`  - generationComplete events: ${generationCompleteCount}`);
  console.log(`  - turnComplete events: ${turnCompleteCount}`);
  console.log(`  - serverContent events: ${serverContentCount}`);

  console.log(`[PipelineTestGeminiGemini] All event types:`);
  Object.entries(mockClientSocket.eventSummary).forEach(([eventType, count]) => {
    console.log(`  - ${eventType}: ${count}`);
  });

  return {
    combination: 'Gemini API Style + Gemini Provider',
    totalEvents: lines.length,
    eventSummary: mockClientSocket.eventSummary,
    logFile: mockClientSocket.logFile
  };
  } catch (error) {
    console.error('[PipelineTestGeminiGemini] Error during pipeline test:', error);
    throw error;
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('[PipelineTestGeminiGemini] Received SIGINT, exiting...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('[PipelineTestGeminiGemini] Received SIGTERM, exiting...');
  process.exit(0);
});

// Run if called directly
if (require.main === module) {
  runPipelineTestGeminiGemini().catch(error => {
    console.error('❌ PipelineTestGeminiGemini test failed:', error);
    process.exit(1);
  });
}