import fs from 'fs';
import path from 'path';
import { EventManager, Providers, ProvidersEvent } from '@realtime-switch/core';
import { Pipeline } from '../src/Pipeline';
import dotenv from 'dotenv';

dotenv.config();

function convertWavToPcm(wavBuffer: Buffer): Buffer {
  // Skip WAV header (44 bytes) to get raw PCM data
  const pcmData = wavBuffer.slice(44);
  return pcmData;
}

// Simple test event manager to capture events (like OAIEventsBaseline)
class PipelineTestEventManager extends EventManager {
  private logFile: string;

  constructor() {
    super();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.logFile = path.join(process.cwd(), `test/pipeline-events-${timestamp}.log`);
    // Create new log file
    fs.writeFileSync(this.logFile, '');
    console.log(`📁 Pipeline test logging to: ${this.logFile}`);
  }

  receiveEvent(event: ProvidersEvent): void {
    const logEntry = `${JSON.stringify(event)}\n`;
    fs.appendFileSync(this.logFile, logEntry);
    console.log(`🔄 Pipeline Event [${event.src}]:`, event.payload.type || 'other');
  }

  getLogFile(): string {
    return this.logFile;
  }
}

async function runPipelineTest() {
  // Validate required API keys
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY not found in environment');
  }
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY not found in environment');
  }

  console.log('🎯 Starting OPENAI→GEMINI pipeline test...');
  
  // Simple setup like baseline tests
  const testEventManager = new PipelineTestEventManager();
  const pipeline = new Pipeline(Providers.OPENAI, 'pipeline-test', testEventManager, Providers.GEMINI);
  
  // Wait for connections to establish
  console.log('⏱️  Waiting for connections...');
  await new Promise(resolve => setTimeout(resolve, 5000));

  // Send simple text through pipeline (avoid audio Blob issue for now)
  console.log('📝 Sending text through pipeline...');
  pipeline.receiveEvent({
    type: "conversation.item.create",
    item: {
      type: "message",
      role: "user",
      content: [{ type: "input_text", text: "Hello, tell me about the color blue" }]
    }
  });

  // Wait 10 seconds for events
  console.log('⏱️  Waiting 10 seconds for events...');
  await new Promise(resolve => setTimeout(resolve, 10000));

  console.log(`✅ Test completed. Check log file: ${testEventManager.getLogFile()}`);
  
  // Check if log file has events
  const logContent = fs.readFileSync(testEventManager.getLogFile(), 'utf-8');
  const eventCount = logContent.split('\n').filter(line => line.trim()).length;
  console.log(`📊 Captured ${eventCount} events in log file`);
  
  if (eventCount > 0) {
    console.log('🎉 SUCCESS: Pipeline working with real connections!');
  } else {
    console.log('⚠️  No events captured - check connections');
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Test interrupted');
  process.exit(0);
});

runPipelineTest().catch(error => {
  console.error('❌ Pipeline test failed:', error);
  process.exit(1);
});