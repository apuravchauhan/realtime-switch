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

class PipelineTestOAIOAI extends EventManager {
  public logFile: string;
  public eventSummary: { [key: string]: number } = {};

  constructor() {
    super();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.logFile = path.join(process.cwd(), `test/pipeline-tests/pipeline-test-oai-oai-${timestamp}.log`);
    // Create new log file
    fs.writeFileSync(this.logFile, '');
  }

  receiveEvent(event: ProvidersEvent): void {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${JSON.stringify(event)}\n`;

    console.log(`[PipelineTestOAIOAI] Event received:`, event);
    fs.appendFileSync(this.logFile, logEntry);

    // Track event types for summary
    const eventType = (event as any).type || 'unknown';
    this.eventSummary[eventType] = (this.eventSummary[eventType] || 0) + 1;
  }
}

export async function runPipelineTestOAIOAI() {
  try {
    // Initialize config to use OPENAI_API_KEY from config system
    const config = Config.getInstance();
    const openaiKey = config.get(ConfigKeys.OPENAI_API_KEY);
    if (!openaiKey) {
      throw new Error('OPENAI_API_KEY not found in config');
    }

    console.log('[PipelineTestOAIOAI] Starting pipeline test (API Style: OPENAI, Provider: OPENAI)...');

    const sessionId = `pipeline-test-oai-oai-${Date.now()}`;
    const mockClientSocket = new PipelineTestOAIOAI();
    
    // Create Pipeline: apiStyle=OPENAI, provider=OPENAI
    const pipeline = new Pipeline(Providers.OPENAI, sessionId, mockClientSocket, Providers.OPENAI);

    console.log('[PipelineTestOAIOAI] Pipeline created, waiting for provider connection...');
    
    // Wait for provider to connect and setup to complete
    await new Promise(resolve => setTimeout(resolve, 5000));

    console.log('[PipelineTestOAIOAI] Simulating session.update (OpenAI format)...');
    
    // Send session.update in OpenAI format
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
    console.log('[PipelineTestOAIOAI] Session update sent, waiting for setup complete...');

    // Wait for setup to complete
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Load and send test audio if available
    const audioPath = path.join('../implementations/providers/gemini/test/assets/say-the-word-blue.wav');
    if (fs.existsSync(audioPath)) {
      console.log('[PipelineTestOAIOAI] Sending test audio through pipeline...');
      const audioBuffer = fs.readFileSync(audioPath);

      // Convert WAV to PCM if it's a WAV file
      const isWavFile = audioPath.endsWith('.wav');
      const pcmBuffer = isWavFile ? convertWavToPcm(audioBuffer) : audioBuffer;

      // Convert to base64 like the HTML client does
      const uint8Array = new Uint8Array(pcmBuffer);
      const base64Audio = Buffer.from(uint8Array).toString('base64');

      // Send audio through pipeline (OpenAI format)
      const audioEvent = {
        type: "input_audio_buffer.append",
        audio: base64Audio
      };

      console.log('[PipelineTestOAIOAI] Sending input_audio_buffer.append...');
      pipeline.receiveEvent(audioEvent);

      console.log('[PipelineTestOAIOAI] Audio sent, waiting for responses...');
      
      // Wait for responses and observe the event flow
      await new Promise(resolve => setTimeout(resolve, 15000));
      
    } else {
      console.log('[PipelineTestOAIOAI] No audio file found, skipping audio test...');
      console.log(`[PipelineTestOAIOAI] Looked for: ${audioPath}`);
    }

    console.log('[PipelineTestOAIOAI] Test complete, cleaning up...');
    pipeline.cleanup();

    console.log(`[PipelineTestOAIOAI] Log file created: ${mockClientSocket.logFile}`);
    
    // Show a summary of events received
    const logContent = fs.readFileSync(mockClientSocket.logFile, 'utf-8');
    const lines = logContent.split('\n').filter(line => line.trim());
    console.log(`[PipelineTestOAIOAI] Total events received: ${lines.length}`);
    
    // Count OpenAI-specific events
    const responseDoneCount = lines.filter(line => line.includes('response.done')).length;
    const responseAudioDeltaCount = lines.filter(line => line.includes('response.audio.delta')).length;
    const responseAudioTranscriptDeltaCount = lines.filter(line => line.includes('response.audio_transcript.delta')).length;
    
    console.log(`[PipelineTestOAIOAI] Event summary:`);
    console.log(`  - response.done events: ${responseDoneCount}`);
    console.log(`  - response.audio.delta events: ${responseAudioDeltaCount}`);
    console.log(`  - response.audio_transcript.delta events: ${responseAudioTranscriptDeltaCount}`);
    
    console.log(`[PipelineTestOAIOAI] All event types:`);
    Object.entries(mockClientSocket.eventSummary).forEach(([eventType, count]) => {
      console.log(`  - ${eventType}: ${count}`);
    });

    return {
      combination: 'OpenAI API Style + OpenAI Provider',
      totalEvents: lines.length,
      eventSummary: mockClientSocket.eventSummary,
      logFile: mockClientSocket.logFile
    };
  } catch (error) {
    console.error('[PipelineTestOAIOAI] Error during pipeline test:', error);
    throw error;
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('[PipelineTestOAIOAI] Received SIGINT, exiting...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('[PipelineTestOAIOAI] Received SIGTERM, exiting...');
  process.exit(0);
});

// Run if called directly
if (require.main === module) {
  runPipelineTestOAIOAI().catch(error => {
    console.error('❌ Pipeline test OAIOAI failed:', error);
    process.exit(1);
  });
}