import fs from 'fs';
import path from 'path';
import OAIEventManager from '../src/OAIEventManager';
import { EventManager, Providers, ProvidersEvent } from '@realtime-switch/core';
import { FreshnessChecker } from './utils/freshness-checker';
import dotenv from 'dotenv';

function convertWavToPcm(wavBuffer: Buffer): Buffer {
  // Skip WAV header (44 bytes) to get raw PCM data
  // WAV format: RIFF header (12) + fmt chunk (24) + data chunk header (8) = 44 bytes
  const pcmData = wavBuffer.slice(44);
  return pcmData;
}

dotenv.config();

class OAIEventsBaseline extends EventManager {
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
  }

  receiveEvent(data: ProvidersEvent): void {
    const logEntry = `${JSON.stringify(data)}\n`;
    fs.appendFileSync(this.logFile, logEntry);
  }
}

async function runBaseline() {
  // Get key from env
  const oaiKey = process.env.OPENAI_API_KEY;
  if (!oaiKey) {
    throw new Error('OPENAI_API_KEY not found in environment');
  }

  const oai = new OAIEventManager();
  const baseliner = new OAIEventsBaseline();
  oai.addSubscribers(baseliner)

  // Await 2 secs here so that ws connects
  await new Promise(resolve => setTimeout(resolve, 2000));
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
        instructions: "Talk to user",
      }
    }
  });

  // Refer the pcm audio and pass it to receiveEvent
  const audioPath = path.join(process.cwd(), 'test/assets/say-the-word-blue.wav');
  if (!fs.existsSync(audioPath)) {
    throw new Error(`Audio file not found: ${audioPath}`);
  }

  const audioBuffer = fs.readFileSync(audioPath);

  // Convert WAV to PCM if it's a WAV file
  const isWavFile = audioPath.endsWith('.wav');
  const pcmBuffer = isWavFile ? convertWavToPcm(audioBuffer) : audioBuffer;

  // Convert PCM buffer to base64 string for OAI API
  const base64Audio = pcmBuffer.toString('base64');
  oai.receiveEvent({ src: Providers.OPENAI, payload: { type: "input_audio_buffer.append", audio: base64Audio } });

  // Wait for responses before cleanup
  await new Promise(resolve => setTimeout(resolve, 5000));

  oai.cleanup();
  
  // Update the last-run.txt file to indicate when baseline was last executed
  const testAssetsDir = path.join(process.cwd(), 'test/assets');
  FreshnessChecker.updateLastRun(testAssetsDir);
  console.log('Baseline run completed and last-run.txt updated');
}

runBaseline();