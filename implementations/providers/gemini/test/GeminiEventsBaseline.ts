import fs from 'fs';
import path from 'path';
import OLDGeminiEventManager from '../src/OLDGeminiEventManager';
import { EventManager, Providers, ProvidersEvent } from '@realtime-switch/core';
import dotenv from 'dotenv';

function convertWavToPcm(wavBuffer: Buffer): Buffer {
  // Skip WAV header (44 bytes) to get raw PCM data
  // WAV format: RIFF header (12) + fmt chunk (24) + data chunk header (8) = 44 bytes
  const pcmData = wavBuffer.slice(44);
  return pcmData;
}

dotenv.config();

class GeminiEventsBaseline extends EventManager {
  private logFile: string;

  constructor() {
    super();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const logsDir = path.join(process.cwd(), 'test/.logs');
    
    // Create .logs directory if it doesn't exist
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    
    this.logFile = path.join(logsDir, `baseline-events-${timestamp}.log`);
    // Create new log file
    fs.writeFileSync(this.logFile, '');
    
    // Create last-run.txt for freshness checking
    const lastRunFile = path.join(process.cwd(), 'test/last-run.txt');
    fs.writeFileSync(lastRunFile, new Date().toISOString());
  }

  receiveEvent(event: ProvidersEvent): void {
    const logEntry = `${JSON.stringify(event)}\n`;
    fs.appendFileSync(this.logFile, logEntry);
  }
}

async function runBaseline() {
  // Get key from env
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    throw new Error('GEMINI_API_KEY not found in environment');
  }

  const gemini = new OLDGeminiEventManager('baseline-test-session');
  const baseliner = new GeminiEventsBaseline();

  gemini.addSubscribers(baseliner);

  // Wait 5 seconds for connection to establish
  await new Promise(resolve => setTimeout(resolve, 5000));

  // Load and send test audio if available
  const audioPath = path.join(process.cwd(), 'test/assets/say-the-word-blue.wav');
  if (fs.existsSync(audioPath)) {
    const audioBuffer = fs.readFileSync(audioPath);

    // Convert WAV to PCM if it's a WAV file
    const isWavFile = audioPath.endsWith('.wav');
    const pcmBuffer = isWavFile ? convertWavToPcm(audioBuffer) : audioBuffer;

    // Convert PCM buffer to base64 string for Gemini API
    const base64Audio = pcmBuffer.toString('base64');

    // Wait a moment before sending audio
    await new Promise(resolve => setTimeout(resolve, 1000));

    gemini.receiveEvent({
      src: Providers.GEMINI,
      payload: {
        audio: {
          data: base64Audio,
          mimeType: "audio/pcm;rate=24000"
        }
      }
    });
  } else {

    // Alternative: Send a simple text message for testing
    gemini.receiveEvent({
      src: Providers.GEMINI,
      payload: {
        type: "user.message",
        content: "Hello, please say something about the color blue."
      }
    });
  }

  // Wait for responses before cleanup (Gemini might take longer than OpenAI)
  await new Promise(resolve => setTimeout(resolve, 10000));

  gemini.cleanup();
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  process.exit(0);
});

process.on('SIGTERM', () => {
  process.exit(0);
});

runBaseline().catch(error => {
  console.error('❌ Baseline test failed:', error);
  process.exit(1);
});