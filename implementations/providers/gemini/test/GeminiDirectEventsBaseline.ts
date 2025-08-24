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

class GeminiDirectEventsBaseline extends EventManager {
  public logFile: string;

  constructor() {
    super();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const logsDir = path.join(process.cwd(), 'test/.logs');
    
    // Create .logs directory if it doesn't exist
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    
    this.logFile = path.join(logsDir, `baseline-direct-events-${timestamp}.log`);
    // Create new log file
    fs.writeFileSync(this.logFile, '');

    // Create last-run.txt for freshness checking
    const lastRunFile = path.join(process.cwd(), 'test/last-run-direct.txt');
    fs.writeFileSync(lastRunFile, new Date().toISOString());
  }

  receiveEvent(event: ProvidersEvent): void {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${JSON.stringify(event)}\n`;

    console.log(`[GeminiDirectBaseline] Event received:`, event);
    fs.appendFileSync(this.logFile, logEntry);
  }
}

async function runDirectBaseline() {
  // Initialize config to use GEMINI_API_KEY from config system
  const config = Config.getInstance();
  const geminiKey = config.get(ConfigKeys.GEMINI_API_KEY);
  if (!geminiKey) {
    throw new Error('GEMINI_API_KEY not found in config');
  }

  console.log('[GeminiDirectBaseline] Starting direct WebSocket baseline test...');

  const sessionId = `direct-test-${Date.now()}`;
  const geminiDirect = new GeminiEventManager(sessionId);
  const baseliner = new GeminiDirectEventsBaseline();

  geminiDirect.addSubscribers(baseliner);

  console.log('[GeminiDirectBaseline] Waiting for connection and setup...');
  // Wait for connection and setup to complete
  await new Promise(resolve => setTimeout(resolve, 5000));

  console.log(`[GeminiDirectBaseline] Connected: ${geminiDirect.isConnected()}`);

  if (geminiDirect.isConnected()) {
    console.log('[GeminiDirectBaseline] Connection established, testing audio...');

    // Load and send test audio if available
    const audioPath = path.join(process.cwd(), 'test/assets/say-the-word-blue.wav');
    if (fs.existsSync(audioPath)) {
      console.log('[GeminiDirectBaseline] Sending audio file...');
      const audioBuffer = fs.readFileSync(audioPath);

      // Convert WAV to PCM if it's a WAV file
      const isWavFile = audioPath.endsWith('.wav');
      const pcmBuffer = isWavFile ? convertWavToPcm(audioBuffer) : audioBuffer;

      // Convert PCM buffer to base64 string for Gemini API
      const base64Audio = pcmBuffer.toString('base64');

      // Wait a moment before sending audio
      await new Promise(resolve => setTimeout(resolve, 1000));

      // First send setup message (required as per documentation)
      console.log('[GeminiDirectBaseline] Sending setup message...');
      geminiDirect.receiveEvent({
        src: Providers.GEMINI,
        payload: {
          setup: {
            model: "models/gemini-2.0-flash-live-001"
          }
        }
      });

      // Wait for setup complete response
      await new Promise(resolve => setTimeout(resolve, 2000));

      console.log('[GeminiDirectBaseline] Sending setup message...');
      geminiDirect.receiveEvent({
        src: Providers.GEMINI,
        payload: {
          setup: {
            model: "models/gemini-2.0-flash-live-001"
          }
        }
      });

      // Wait for setup complete response
      await new Promise(resolve => setTimeout(resolve, 2000));

      console.log('[GeminiDirectBaseline] Sending realtimeInput with audio...');
      geminiDirect.receiveEvent({
        src: Providers.GEMINI,
        payload: {
          realtimeInput: {
            audio: {
              mimeType: "audio/pcm;rate=24000",
              data: base64Audio
            }
          }
        }
      });

      console.log('[GeminiDirectBaseline] Audio sent, waiting for responses...');
    } else {
      console.log('[GeminiDirectBaseline] No audio file found, skipping test...');
      return;
    }

    // Wait longer for responses (Gemini might take time)
    console.log('[GeminiDirectBaseline] Waiting for responses...');
    await new Promise(resolve => setTimeout(resolve, 15000));
  } else {
    console.error('[GeminiDirectBaseline] Failed to establish connection');
  }

  console.log('[GeminiDirectBaseline] Test complete, cleaning up...');
  geminiDirect.cleanup();

  console.log(`[GeminiDirectBaseline] Log file created: ${baseliner.logFile}`);
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('[GeminiDirectBaseline] Received SIGINT, exiting...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('[GeminiDirectBaseline] Received SIGTERM, exiting...');
  process.exit(0);
});

runDirectBaseline().catch(error => {
  console.error('❌ Direct baseline test failed:', error);
  process.exit(1);
});