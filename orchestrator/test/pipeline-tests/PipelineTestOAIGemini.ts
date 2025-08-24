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

class PipelineTestOAIGemini extends EventManager {
  public logFile: string;
  public eventSummary: { [key: string]: number } = {};

  constructor() {
    super();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.logFile = path.join(process.cwd(), `test/pipeline-tests/pipeline-test-oai-gemini-${timestamp}.log`);
    // Create new log file
    fs.writeFileSync(this.logFile, '');
  }

  receiveEvent(event: ProvidersEvent): void {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${JSON.stringify(event)}\n`;

    console.log(`[PipelineTestOAIGemini] Event received:`, event);
    fs.appendFileSync(this.logFile, logEntry);

    // Track event types for summary
    const eventType = (event as any).type || 'unknown';
    this.eventSummary[eventType] = (this.eventSummary[eventType] || 0) + 1;
  }
}

export async function runPipelineTestOAIGemini() {
  // Initialize config to use GEMINI_API_KEY from config system
  const config = Config.getInstance();
  const geminiKey = config.get(ConfigKeys.GEMINI_API_KEY);
  if (!geminiKey) {
    throw new Error('GEMINI_API_KEY not found in config');
  }

  console.log('[PipelineTestOAIGemini] Starting pipeline test (API Style: OPENAI, Provider: GEMINI)...');
  console.log('[PipelineTestOAIGemini] This tests cross-provider transformation scenario');

  const sessionId = `pipeline-test-oai-gemini-${Date.now()}`;
  const mockClientSocket = new PipelineTestOAIGemini();
  
  // Create Pipeline: apiStyle=OPENAI (what client expects), provider=GEMINI (actual provider)
  // This tests the transformation scenario
  const pipeline = new Pipeline(Providers.OPENAI, sessionId, mockClientSocket, Providers.GEMINI);

  console.log('[PipelineTestOAIGemini] Pipeline created, waiting for provider connection...');
  
  // Wait for provider to connect and setup to complete
  await new Promise(resolve => setTimeout(resolve, 5000));

  console.log('[PipelineTestOAIGemini] Simulating session.update (OpenAI format)...');
  
  // Send session.update in OpenAI format (client expects OpenAI format)
  const sessionUpdateMessage = {
    type: "session.update",
    session: {
      modalities: ["text", "audio"],
      turn_detection: { type: "server_vad", "silence_duration_ms": 700 },
      voice: "ash",
      input_audio_transcription: { model: "whisper-1", language: 'en' },
      input_audio_format: "pcm16",
      output_audio_format: "pcm16",
      instructions: "Talk to user"
    }
  };
  
  pipeline.receiveEvent(sessionUpdateMessage);
  console.log('[PipelineTestOAIGemini] Session update sent, waiting for setup complete...');

  // Wait for setup to complete
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Load and send test audio if available
  const audioPath = path.join('../implementations/providers/gemini/test/assets/say-the-word-blue.wav');
  if (fs.existsSync(audioPath)) {
    console.log('[PipelineTestOAIGemini] Sending test audio through pipeline...');
    const audioBuffer = fs.readFileSync(audioPath);

    // Convert WAV to PCM if it's a WAV file
    const isWavFile = audioPath.endsWith('.wav');
    const pcmBuffer = isWavFile ? convertWavToPcm(audioBuffer) : audioBuffer;

    // Convert to base64 like the HTML client does
    const uint8Array = new Uint8Array(pcmBuffer);
    const base64Audio = Buffer.from(uint8Array).toString('base64');

    // Send audio through pipeline in OpenAI format (input_audio_buffer.append)
    const audioEvent = {
      type: "input_audio_buffer.append",
      audio: base64Audio
    };

    console.log('[PipelineTestOAIGemini] Sending input_audio_buffer.append (OpenAI format)...');
    pipeline.receiveEvent(audioEvent);

    console.log('[PipelineTestOAIGemini] Audio sent, waiting for responses...');
    
    // Wait for responses and observe the event flow
    await new Promise(resolve => setTimeout(resolve, 15000));
    
  } else {
    console.log('[PipelineTestOAIGemini] No audio file found, skipping audio test...');
    console.log(`[PipelineTestOAIGemini] Looked for: ${audioPath}`);
  }

  console.log('[PipelineTestOAIGemini] Test complete, cleaning up...');
  pipeline.cleanup();

  console.log(`[PipelineTestOAIGemini] Log file created: ${mockClientSocket.logFile}`);
  
  // Show a summary of events received
  const logContent = fs.readFileSync(mockClientSocket.logFile, 'utf-8');
  const lines = logContent.split('\n').filter(line => line.trim());
  console.log(`[PipelineTestOAIGemini] Total events received: ${lines.length}`);
  
  // Count transformed events - should see response.done instead of generationComplete
  const generationCompleteCount = lines.filter(line => line.includes('generationComplete')).length;
  const responseDoneCount = lines.filter(line => line.includes('response.done')).length;
  const turnCompleteCount = lines.filter(line => line.includes('turnComplete')).length;
  
  console.log(`[PipelineTestOAIGemini] Event summary (transformation check):`);
  console.log(`  - generationComplete events: ${generationCompleteCount} (should be 0 due to transformation)`);
  console.log(`  - response.done events: ${responseDoneCount} (should be > 0, transformed from generationComplete)`);
  console.log(`  - turnComplete events: ${turnCompleteCount}`);
  
  console.log(`[PipelineTestOAIGemini] All event types:`);
  Object.entries(mockClientSocket.eventSummary).forEach(([eventType, count]) => {
    console.log(`  - ${eventType}: ${count}`);
  });

  return {
    combination: 'OpenAI API Style + Gemini Provider (Cross-Provider Transformation)',
    totalEvents: lines.length,
    eventSummary: mockClientSocket.eventSummary,
    transformedEvents: {
      generationComplete: generationCompleteCount,
      responseDone: responseDoneCount,
      turnComplete: turnCompleteCount
    },
    logFile: mockClientSocket.logFile
  };
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('[PipelineTestOAIGemini] Received SIGINT, exiting...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('[PipelineTestOAIGemini] Received SIGTERM, exiting...');
  process.exit(0);
});

// Run if called directly
if (require.main === module) {
  runPipelineTestOAIGemini().catch(error => {
    console.error('❌ Pipeline test OAI-Gemini failed:', error);
    process.exit(1);
  });
}