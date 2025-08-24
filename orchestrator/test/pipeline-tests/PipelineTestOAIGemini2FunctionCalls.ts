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

// Helper function to create OpenAI-format tool definitions
function getOAIToolDefinitions() {
  return [{
    type: "function",
    name: "get_temperature",
    description: "Get the current temperature for a given city",
    parameters: {
      type: "object",
      properties: {
        city: {
          type: "string",
          description: "The name of the city"
        }
      },
      required: ["city"]
    }
  }, {
    type: "function",
    name: "get_forecast",
    description: "Get the weather forecast for a given city",
    parameters: {
      type: "object",
      properties: {
        city: {
          type: "string",
          description: "The name of the city"
        }
      },
      required: ["city"]
    }
  }];
}

class PipelineTestOAIGemini2FunctionCalls extends EventManager {
  public logFile: string;
  public eventSummary: { [key: string]: number } = {};
  public functionCallCount: number = 0;
  public functionCallIds: string[] = [];

  constructor() {
    super();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.logFile = path.join(process.cwd(), `test/pipeline-tests/pipeline-test-oai-gemini-2-function-calls-${timestamp}.log`);
    // Create new log file
    fs.writeFileSync(this.logFile, '');
  }

  receiveEvent(event: ProvidersEvent): void {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${JSON.stringify(event)}\n`;

    console.log(`[PipelineTestOAIGemini2FunctionCalls] Event received:`, event);
    fs.appendFileSync(this.logFile, logEntry);

    // Track event types for summary
    const eventType = event.payload?.type || 'unknown';
    this.eventSummary[eventType] = (this.eventSummary[eventType] || 0) + 1;

    // Track function calls specifically
    if (event.payload?.type === 'response.output_item.done' &&
      event.payload?.item?.type === 'function_call') {
      this.functionCallCount++;
      this.functionCallIds.push(event.payload.item.call_id);
      console.log(`[PipelineTestOAIGemini2FunctionCalls] Function call detected: ${event.payload.item.name} (ID: ${event.payload.item.call_id})`);
    }
  }

  // Method to chunk and send audio in multiple parts (like baseline test)
  async chunkAndSend(pipeline: Pipeline, base64Audio: string, chunkSize: number = 32088): Promise<void> {
    console.log('[PipelineTestOAIGemini2FunctionCalls] Starting chunked audio send...');
    console.log(`[PipelineTestOAIGemini2FunctionCalls] Total audio length: ${base64Audio.length} characters`);

    // Break into chunks
    const chunks = [];
    for (let i = 0; i < base64Audio.length; i += chunkSize) {
      chunks.push(base64Audio.slice(i, i + chunkSize));
    }

    console.log(`[PipelineTestOAIGemini2FunctionCalls] Sending ${chunks.length} audio chunks...`);

    // Send chunks with small delays
    for (let i = 0; i < chunks.length; i++) {
      console.log(`[PipelineTestOAIGemini2FunctionCalls] Sending chunk ${i + 1}/${chunks.length} (${chunks[i].length} characters)...`);

      const audioEvent = {
        type: "input_audio_buffer.append",
        audio: chunks[i]
      };

      pipeline.receiveEvent(audioEvent);

      // Small delay between chunks (similar to baseline implementation)
      if (i < chunks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    console.log('[PipelineTestOAIGemini2FunctionCalls] All audio chunks sent successfully');
  }

  // Method to simulate function response (like a client would do)
  async simulateFunctionResponse(pipeline: Pipeline, callId: string, functionName: string) {
    let responseData;
    if (functionName === "get_temperature") {
      responseData = {
        temperature: 22,
        unit: "celsius",
        city: "Toronto"
      };
    } else if (functionName === "get_forecast") {
      responseData = {
        forecast: "Sunny with a chance of clouds",
        temperature: "20-25°C",
        city: "Toronto"
      };
    } else {
      responseData = {
        result: "Unknown function"
      };
    }

    console.log(`[PipelineTestOAIGemini2FunctionCalls] Simulating function response for ${functionName} (ID: ${callId})`);

    // Send function response in OpenAI format
    const functionResponseEvent = {
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: callId,
        output: JSON.stringify(responseData)
      }
    };

    pipeline.receiveEvent(functionResponseEvent);
    console.log(`[PipelineTestOAIGemini2FunctionCalls] Function response sent for ${functionName}`);
  }
}

export async function runPipelineTestOAIGemini2FunctionCalls() {
  // Initialize config to use GEMINI_API_KEY from config system
  const config = Config.getInstance();
  const geminiKey = config.get(ConfigKeys.GEMINI_API_KEY);
  if (!geminiKey) {
    throw new Error('GEMINI_API_KEY not found in config');
  }

  console.log('[PipelineTestOAIGemini2FunctionCalls] Starting pipeline 2-function call test (API Style: OPENAI, Provider: GEMINI)...');
  console.log('[PipelineTestOAIGemini2FunctionCalls] This tests cross-provider transformation with multiple function calling');

  const sessionId = `pipeline-test-oai-gemini-2-function-calls-${Date.now()}`;
  const mockClientSocket = new PipelineTestOAIGemini2FunctionCalls();

  // Create Pipeline: apiStyle=OPENAI (what client expects), provider=GEMINI (actual provider)  
  // This tests the transformation scenario with function calling
  const pipeline = new Pipeline(Providers.OPENAI, sessionId, mockClientSocket, Providers.GEMINI);

  console.log('[PipelineTestOAIGemini2FunctionCalls] Pipeline created, waiting for provider connection...');

  // Wait for provider to connect and setup to complete
  await new Promise(resolve => setTimeout(resolve, 5000));

  console.log('[PipelineTestOAIGemini2FunctionCalls] Simulating session.update with function tools (OpenAI format)...');

  // Send session.update in OpenAI format with function definitions
  const sessionUpdateMessage = {
    type: "session.update",
    session: {
      modalities: ["text", "audio"],
      turn_detection: { type: "server_vad", "silence_duration_ms": 700 },
      voice: "ash",
      input_audio_transcription: { model: "whisper-1", language: 'en' },
      input_audio_format: "pcm16",
      output_audio_format: "pcm16",
      instructions: "You are a helpful assistant. Use the two tools to tell the weather",
      tools: getOAIToolDefinitions()
    }
  };

  pipeline.receiveEvent(sessionUpdateMessage);
  console.log('[PipelineTestOAIGemini2FunctionCalls] Session update with tools sent, waiting for setup complete...');

  // Wait for setup to complete
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Load and send test audio 
  const audioPath = path.join(process.cwd(), 'test/pipeline-tests/get-toronto-weather.wav');
  if (fs.existsSync(audioPath)) {
    console.log('[PipelineTestOAIGemini2FunctionCalls] Sending test audio asking for weather through pipeline...');
    const audioBuffer = fs.readFileSync(audioPath);

    // Convert WAV to PCM if it's a WAV file
    const isWavFile = audioPath.endsWith('.wav');
    const pcmBuffer = isWavFile ? convertWavToPcm(audioBuffer) : audioBuffer;

    // Convert to base64 like the HTML client does
    const uint8Array = new Uint8Array(pcmBuffer);
    const base64Audio = Buffer.from(uint8Array).toString('base64');

    // Audio will be sent in chunks via chunkAndSend method

    console.log('[PipelineTestOAIGemini2FunctionCalls] Using chunked audio send...');
    await mockClientSocket.chunkAndSend(pipeline, base64Audio);

    console.log('[PipelineTestOAIGemini2FunctionCalls] Audio sent, waiting for function calls...');

    // Wait for function calls to be generated
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Check if we received any function calls and respond to them
    if (mockClientSocket.functionCallIds.length > 0) {
      console.log(`[PipelineTestOAIGemini2FunctionCalls] Received ${mockClientSocket.functionCallIds.length} function calls, simulating responses...`);

      // Get the last few events to find function call details
      const logContent = fs.readFileSync(mockClientSocket.logFile, 'utf-8');
      const lines = logContent.split('\n').filter(line => line.trim());

      for (const callId of mockClientSocket.functionCallIds) {
        // Find the function call event to get the function name
        const functionCallLine = lines.find(line =>
          line.includes('response.output_item.done') &&
          line.includes(`"call_id":"${callId}"`)
        );

        if (functionCallLine) {
          const match = functionCallLine.match(/"name":"([^"]+)"/);
          const functionName = match ? match[1] : 'unknown';

          // Wait a bit between responses
          await new Promise(resolve => setTimeout(resolve, 1000));
          await mockClientSocket.simulateFunctionResponse(pipeline, callId, functionName);
        }
      }

      // Wait for potential second function call after first response
      console.log('[PipelineTestOAIGemini2FunctionCalls] Waiting for potential second function call...');
      await new Promise(resolve => setTimeout(resolve, 10000));

      // Check if additional function calls were generated
      if (mockClientSocket.functionCallIds.length > 1) {
        console.log(`[PipelineTestOAIGemini2FunctionCalls] Total function calls received: ${mockClientSocket.functionCallIds.length}`);
        
        // Handle any additional function calls that came after the first response
        const processedIds = new Set();
        const currentLogContent = fs.readFileSync(mockClientSocket.logFile, 'utf-8');
        const currentLines = currentLogContent.split('\n').filter(line => line.trim());

        for (const callId of mockClientSocket.functionCallIds) {
          if (!processedIds.has(callId)) {
            const functionCallLine = currentLines.find(line =>
              line.includes('response.output_item.done') &&
              line.includes(`"call_id":"${callId}"`)
            );

            if (functionCallLine) {
              const match = functionCallLine.match(/"name":"([^"]+)"/);
              const functionName = match ? match[1] : 'unknown';

              console.log(`[PipelineTestOAIGemini2FunctionCalls] Processing function call: ${functionName} (ID: ${callId})`);
              
              await new Promise(resolve => setTimeout(resolve, 1000));
              await mockClientSocket.simulateFunctionResponse(pipeline, callId, functionName);
              processedIds.add(callId);
            }
          }
        }
      }

      // Wait for final response after all function responses
      console.log('[PipelineTestOAIGemini2FunctionCalls] Waiting for final response after function calls...');
      await new Promise(resolve => setTimeout(resolve, 10000));

    } else {
      console.log('[PipelineTestOAIGemini2FunctionCalls] No function calls received, waiting longer for responses...');
      await new Promise(resolve => setTimeout(resolve, 15000));
    }

  } else {
    console.log('[PipelineTestOAIGemini2FunctionCalls] No audio file found, skipping audio test...');
    console.log(`[PipelineTestOAIGemini2FunctionCalls] Looked for: ${audioPath}`);
  }

  console.log('[PipelineTestOAIGemini2FunctionCalls] Test complete, cleaning up...');
  pipeline.cleanup();

  console.log(`[PipelineTestOAIGemini2FunctionCalls] Log file created: ${mockClientSocket.logFile}`);

  // Show a summary of events received
  const logContent = fs.readFileSync(mockClientSocket.logFile, 'utf-8');
  const lines = logContent.split('\n').filter(line => line.trim());
  console.log(`[PipelineTestOAIGemini2FunctionCalls] Total events received: ${lines.length}`);

  // Count key event types for function call analysis
  const transcriptDeltas = lines.filter(line => line.includes('conversation.item.input_audio_transcription.delta')).length;
  const audioDeltas = lines.filter(line => line.includes('response.audio.delta')).length;
  const audioTranscriptDeltas = lines.filter(line => line.includes('response.audio_transcript.delta')).length;
  const functionCalls = lines.filter(line =>
    line.includes('response.output_item.done') &&
    line.includes('"type":"function_call"')
  ).length;
  const responseDone = lines.filter(line => line.includes('response.done')).length;

  console.log(`[PipelineTestOAIGemini2FunctionCalls] Event summary (function call analysis):`);
  console.log(`  - Input transcription deltas: ${transcriptDeltas}`);
  console.log(`  - Audio deltas: ${audioDeltas}`);
  console.log(`  - Audio transcript deltas: ${audioTranscriptDeltas}`);
  console.log(`  - Function calls: ${functionCalls}`);
  console.log(`  - Response done events: ${responseDone}`);

  console.log(`[PipelineTestOAIGemini2FunctionCalls] Function call details:`);
  console.log(`  - Total function calls captured: ${mockClientSocket.functionCallCount}`);
  console.log(`  - Function call IDs: ${mockClientSocket.functionCallIds.join(', ')}`);

  return {
    combination: 'OpenAI API Style + Gemini Provider (2 Function Calls Test)',
    totalEvents: lines.length,
    eventSummary: mockClientSocket.eventSummary,
    functionCallAnalysis: {
      transcriptDeltas,
      audioDeltas,
      audioTranscriptDeltas,
      functionCalls,
      responseDone,
      functionCallCount: mockClientSocket.functionCallCount,
      functionCallIds: mockClientSocket.functionCallIds
    },
    logFile: mockClientSocket.logFile
  };
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('[PipelineTestOAIGemini2FunctionCalls] Received SIGINT, exiting...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('[PipelineTestOAIGemini2FunctionCalls] Received SIGTERM, exiting...');
  process.exit(0);
});

// Run if called directly
if (require.main === module) {
  runPipelineTestOAIGemini2FunctionCalls().catch(error => {
    console.error('❌ Pipeline test OAI-Gemini 2 Function Calls failed:', error);
    process.exit(1);
  });
}