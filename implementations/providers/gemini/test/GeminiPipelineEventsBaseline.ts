import fs from 'fs';
import path from 'path';
import { EventManager, ProvidersEvent, Config, ConfigKeys, Providers } from '@realtime-switch/core';
import { Pipeline } from '../../../orchestrator/dist/Pipeline';
import { SocketEventManager } from '../../../orchestrator/dist/SocketEventManager';
import dotenv from 'dotenv';

function convertWavToPcm(wavBuffer: Buffer): Buffer {
  // Skip WAV header (44 bytes) to get raw PCM data
  // WAV format: RIFF header (12) + fmt chunk (24) + data chunk header (8) = 44 bytes
  const pcmData = wavBuffer.slice(44);
  return pcmData;
}

dotenv.config();

class GeminiPipelineEventsBaseline extends EventManager {
  public logFile: string;

  constructor() {
    super();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const logsDir = path.join(process.cwd(), 'test/.logs');
    
    // Create .logs directory if it doesn't exist
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    
    this.logFile = path.join(logsDir, `pipeline-events-${timestamp}.log`);
    // Create new log file
    fs.writeFileSync(this.logFile, '');

    // Create last-run.txt for comparison with direct test
    const lastRunFile = path.join(process.cwd(), 'test/last-run-pipeline.txt');
    fs.writeFileSync(lastRunFile, new Date().toISOString());
  }

  receiveEvent(event: ProvidersEvent): void {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${JSON.stringify(event)}\n`;

    console.log(`[GeminiPipelineBaseline] Event received:`, event);
    fs.appendFileSync(this.logFile, logEntry);
  }
}

async function runPipelineBaseline() {
  // Initialize config to use GEMINI_API_KEY from config system
  const config = Config.getInstance();
  const geminiKey = config.get(ConfigKeys.GEMINI_API_KEY);
  if (!geminiKey) {
    throw new Error('GEMINI_API_KEY not found in config');
  }

  console.log('[GeminiPipelineBaseline] Starting pipeline baseline test (simulates server scenario)...');
  console.log('[GeminiPipelineBaseline] This test simulates: apiStyle=OPENAI, provider=GEMINI');

  const sessionId = `pipeline-test-${Date.now()}`;
  const mockClientSocket = new GeminiPipelineEventsBaseline();
  
  // Create Pipeline exactly like the server does
  // apiStyle=OPENAI (what client expects), provider=GEMINI (actual provider)
  const pipeline = new Pipeline(Providers.OPENAI, sessionId, mockClientSocket, Providers.GEMINI);

  console.log('[GeminiPipelineBaseline] Pipeline created, waiting for provider connection...');
  
  // Wait for provider to connect and setup to complete
  await new Promise(resolve => setTimeout(resolve, 5000));

  console.log('[GeminiPipelineBaseline] Simulating session.update (like the HTML client does)...');
  
  // Send session.update exactly like the HTML client does
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
  console.log('[GeminiPipelineBaseline] Session update sent, waiting for setup complete...');

  // Wait for setup to complete
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Load and send test audio if available
  const audioPath = path.join(process.cwd(), 'test/assets/say-the-word-blue.wav');
  if (fs.existsSync(audioPath)) {
    console.log('[GeminiPipelineBaseline] Sending test audio through pipeline...');
    const audioBuffer = fs.readFileSync(audioPath);

    // Convert WAV to PCM if it's a WAV file
    const isWavFile = audioPath.endsWith('.wav');
    const pcmBuffer = isWavFile ? convertWavToPcm(audioBuffer) : audioBuffer;

    // Convert to base64 like the HTML client does
    const uint8Array = new Uint8Array(pcmBuffer);
    const base64Audio = Buffer.from(uint8Array).toString('base64');

    // Send audio through pipeline (simulates client input)
    const audioEvent = {
      type: "input_audio_buffer.append",
      audio: base64Audio
    };

    console.log('[GeminiPipelineBaseline] Sending input_audio_buffer.append...');
    pipeline.receiveEvent(audioEvent);

    console.log('[GeminiPipelineBaseline] Audio sent, waiting for responses...');
    
    // Wait for responses and observe the event flow
    await new Promise(resolve => setTimeout(resolve, 15000));
    
  } else {
    console.log('[GeminiPipelineBaseline] No audio file found, skipping audio test...');
  }

  console.log('[GeminiPipelineBaseline] Test complete, cleaning up...');
  pipeline.cleanup();

  console.log(`[GeminiPipelineBaseline] Log file created: ${mockClientSocket.logFile}`);
  console.log(`[GeminiPipelineBaseline] Compare this with direct test logs to see the difference!`);
  
  // Show a summary of events received
  const logContent = fs.readFileSync(mockClientSocket.logFile, 'utf-8');
  const lines = logContent.split('\n').filter(line => line.trim());
  console.log(`[GeminiPipelineBaseline] Total events received: ${lines.length}`);
  
  // Count specific event types
  const generationCompleteCount = lines.filter(line => line.includes('generationComplete')).length;
  const turnCompleteCount = lines.filter(line => line.includes('turnComplete')).length;
  const responseDoneCount = lines.filter(line => line.includes('response.done')).length;
  
  console.log(`[GeminiPipelineBaseline] Event summary:`);
  console.log(`  - generationComplete events: ${generationCompleteCount}`);
  console.log(`  - turnComplete events: ${turnCompleteCount}`);
  console.log(`  - response.done events: ${responseDoneCount}`);
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('[GeminiPipelineBaseline] Received SIGINT, exiting...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('[GeminiPipelineBaseline] Received SIGTERM, exiting...');
  process.exit(0);
});

runPipelineBaseline().catch(error => {
  console.error('❌ Pipeline baseline test failed:', error);
  process.exit(1);
});