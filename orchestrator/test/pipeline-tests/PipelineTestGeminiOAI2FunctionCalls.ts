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

// Helper function to create Gemini-format tool definitions
function getGeminiToolDefinitions() {
  return [{
    functionDeclarations: [{
      name: "get_temperature",
      description: "Get the current temperature for a given city",
      parameters: {
        type: "OBJECT",
        properties: {
          city: {
            type: "STRING",
            description: "The name of the city"
          }
        },
        required: ["city"]
      }
    }, {
      name: "get_forecast",
      description: "Get the weather forecast for a given city",
      parameters: {
        type: "OBJECT",
        properties: {
          city: {
            type: "STRING",
            description: "The name of the city"
          }
        },
        required: ["city"]
      }
    }]
  }];
}

class PipelineTestGeminiOAI2FunctionCalls extends EventManager {
  public logFile: string;
  public eventSummary: { [key: string]: number } = {};
  public functionCallCount: number = 0;
  public functionCallIds: string[] = [];

  constructor() {
    super();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.logFile = path.join(process.cwd(), `test/pipeline-tests/pipeline-test-gemini-oai-2-function-calls-${timestamp}.log`);
    // Create new log file
    fs.writeFileSync(this.logFile, '');
  }

  receiveEvent(event: ProvidersEvent): void {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${JSON.stringify(event)}\n`;

    console.log(`[PipelineTestGeminiOAI2FunctionCalls] Event received:`, event);
    fs.appendFileSync(this.logFile, logEntry);

    // Track event types for summary
    const eventType = event.payload?.type || event.payload?.toolCall ? 'toolCall' : event.payload?.serverContent ? 'serverContent' : 'unknown';
    this.eventSummary[eventType] = (this.eventSummary[eventType] || 0) + 1;

    // Track function calls specifically (Gemini format)
    if (event.payload?.toolCall?.functionCalls) {
      for (const funcCall of event.payload.toolCall.functionCalls) {
        this.functionCallCount++;
        this.functionCallIds.push(funcCall.id);
        console.log(`[PipelineTestGeminiOAI2FunctionCalls] Function call detected: ${funcCall.name} (ID: ${funcCall.id})`);
      }
    }
  }

  // Method to chunk and send audio in multiple parts (like baseline test)
  async chunkAndSend(pipeline: Pipeline, base64Audio: string, chunkSize: number = 32088): Promise<void> {
    console.log('[PipelineTestGeminiOAI2FunctionCalls] Starting chunked audio send...');
    console.log(`[PipelineTestGeminiOAI2FunctionCalls] Total audio length: ${base64Audio.length} characters`);

    // Break into chunks
    const chunks = [];
    for (let i = 0; i < base64Audio.length; i += chunkSize) {
      chunks.push(base64Audio.slice(i, i + chunkSize));
    }

    console.log(`[PipelineTestGeminiOAI2FunctionCalls] Sending ${chunks.length} audio chunks...`);

    // Send chunks with small delays (Gemini format)
    for (let i = 0; i < chunks.length; i++) {
      console.log(`[PipelineTestGeminiOAI2FunctionCalls] Sending chunk ${i + 1}/${chunks.length} (${chunks[i].length} characters)...`);

      const audioEvent = {
        realtimeInput: {
          audio: {
            mimeType: "audio/pcm;rate=24000",
            data: chunks[i]
          }
        }
      };

      pipeline.receiveEvent(audioEvent);

      // Small delay between chunks (similar to baseline implementation)
      if (i < chunks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    console.log('[PipelineTestGeminiOAI2FunctionCalls] All audio chunks sent successfully');
  }

  // Method to simulate function response (like a client would do in Gemini format)
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

    console.log(`[PipelineTestGeminiOAI2FunctionCalls] Simulating function response for ${functionName} (ID: ${callId})`);

    // Send function response in Gemini format
    const functionResponseEvent = {
      toolResponse: {
        functionResponses: [{
          id: callId,
          name: functionName,
          response: responseData
        }]
      }
    };

    pipeline.receiveEvent(functionResponseEvent);
    console.log(`[PipelineTestGeminiOAI2FunctionCalls] Function response sent for ${functionName}`);
  }
}

export async function runPipelineTestGeminiOAI2FunctionCalls() {
  // Initialize config to use OPENAI_API_KEY from config system
  const config = Config.getInstance();
  const openaiKey = config.get(ConfigKeys.OPENAI_API_KEY);
  if (!openaiKey) {
    throw new Error('OPENAI_API_KEY not found in config');
  }

  console.log('[PipelineTestGeminiOAI2FunctionCalls] Starting pipeline 2-function call test (API Style: GEMINI, Provider: OPENAI)...');
  console.log('[PipelineTestGeminiOAI2FunctionCalls] This tests cross-provider transformation with multiple function calling');

  const sessionId = `pipeline-test-gemini-oai-2-function-calls-${Date.now()}`;
  const mockClientSocket = new PipelineTestGeminiOAI2FunctionCalls();

  // Create Pipeline: apiStyle=GEMINI (what client expects), provider=OPENAI (actual provider)  
  // This tests the transformation scenario with function calling
  const pipeline = new Pipeline(Providers.GEMINI, sessionId, mockClientSocket, Providers.OPENAI);

  console.log('[PipelineTestGeminiOAI2FunctionCalls] Pipeline created, waiting for provider connection...');

  // Wait for provider to connect and setup to complete
  await new Promise(resolve => setTimeout(resolve, 5000));

  console.log('[PipelineTestGeminiOAI2FunctionCalls] Simulating setup with function tools (Gemini format)...');

  // Send setup message in Gemini format with function definitions
  const setupMessage = {
    setup: {
      model: "models/gemini-2.0-flash-live-001",
      realtimeInputConfig: {
        automaticActivityDetection: {
          disabled: false,
          endOfSpeechSensitivity: "END_SENSITIVITY_HIGH"
        }
      },
      generationConfig: {
        responseModalities: ["AUDIO"]
      },
      outputAudioTranscription: {},
      inputAudioTranscription: {},
      systemInstruction: {
        parts: [{
          text: "You are a helpful assistant. When someone asks about weather, call temperature and forecast function to share a weather summary"
        }]
      },
      tools: getGeminiToolDefinitions()
    }
  };

  pipeline.receiveEvent(setupMessage);
  console.log('[PipelineTestGeminiOAI2FunctionCalls] Setup with tools sent, waiting for setup complete...');

  // Wait for setup to complete
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Load and send test audio 
  const audioPath = path.join(process.cwd(), 'test/pipeline-tests/get-toronto-weather.wav');
  if (fs.existsSync(audioPath)) {
    console.log('[PipelineTestGeminiOAI2FunctionCalls] Sending test audio asking for weather through pipeline...');
    const audioBuffer = fs.readFileSync(audioPath);

    // Convert WAV to PCM if it's a WAV file
    const isWavFile = audioPath.endsWith('.wav');
    const pcmBuffer = isWavFile ? convertWavToPcm(audioBuffer) : audioBuffer;

    // Convert to base64 like the HTML client does
    const uint8Array = new Uint8Array(pcmBuffer);
    const base64Audio = Buffer.from(uint8Array).toString('base64');

    // Audio will be sent in chunks via chunkAndSend method

    console.log('[PipelineTestGeminiOAI2FunctionCalls] Using chunked audio send...');
    await mockClientSocket.chunkAndSend(pipeline, base64Audio);

    console.log('[PipelineTestGeminiOAI2FunctionCalls] Audio sent, waiting for function calls...');

    // Wait for function calls to be generated
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Check if we received any function calls and respond to them
    if (mockClientSocket.functionCallIds.length > 0) {
      console.log(`[PipelineTestGeminiOAI2FunctionCalls] Received ${mockClientSocket.functionCallIds.length} function calls, simulating responses...`);

      // Get the last few events to find function call details
      const logContent = fs.readFileSync(mockClientSocket.logFile, 'utf-8');
      const lines = logContent.split('\n').filter(line => line.trim());

      for (const callId of mockClientSocket.functionCallIds) {
        // Find the function call event to get the function name
        const functionCallLine = lines.find(line =>
          line.includes('toolCall') &&
          line.includes(`"id":"${callId}"`)
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
      console.log('[PipelineTestGeminiOAI2FunctionCalls] Waiting for potential second function call...');
      await new Promise(resolve => setTimeout(resolve, 10000));

      // Check if additional function calls were generated
      if (mockClientSocket.functionCallIds.length > 1) {
        console.log(`[PipelineTestGeminiOAI2FunctionCalls] Total function calls received: ${mockClientSocket.functionCallIds.length}`);

        // Handle any additional function calls that came after the first response
        const processedIds = new Set();
        const currentLogContent = fs.readFileSync(mockClientSocket.logFile, 'utf-8');
        const currentLines = currentLogContent.split('\n').filter(line => line.trim());

        for (const callId of mockClientSocket.functionCallIds) {
          if (!processedIds.has(callId)) {
            const functionCallLine = currentLines.find(line =>
              line.includes('toolCall') &&
              line.includes(`"id":"${callId}"`)
            );

            if (functionCallLine) {
              const match = functionCallLine.match(/"name":"([^"]+)"/);
              const functionName = match ? match[1] : 'unknown';

              console.log(`[PipelineTestGeminiOAI2FunctionCalls] Processing function call: ${functionName} (ID: ${callId})`);

              await new Promise(resolve => setTimeout(resolve, 1000));
              await mockClientSocket.simulateFunctionResponse(pipeline, callId, functionName);
              processedIds.add(callId);
            }
          }
        }
      }

      // Wait for final response after all function responses
      console.log('[PipelineTestGeminiOAI2FunctionCalls] Waiting for final response after function calls...');
      await new Promise(resolve => setTimeout(resolve, 10000));

    } else {
      console.log('[PipelineTestGeminiOAI2FunctionCalls] No function calls received, waiting longer for responses...');
      await new Promise(resolve => setTimeout(resolve, 15000));
    }

  } else {
    console.log('[PipelineTestGeminiOAI2FunctionCalls] No audio file found, skipping audio test...');
    console.log(`[PipelineTestGeminiOAI2FunctionCalls] Looked for: ${audioPath}`);
  }

  console.log('[PipelineTestGeminiOAI2FunctionCalls] Test complete, cleaning up...');
  pipeline.cleanup();

  console.log(`[PipelineTestGeminiOAI2FunctionCalls] Log file created: ${mockClientSocket.logFile}`);

  // Show a summary of events received
  const logContent = fs.readFileSync(mockClientSocket.logFile, 'utf-8');
  const lines = logContent.split('\n').filter(line => line.trim());
  console.log(`[PipelineTestGeminiOAI2FunctionCalls] Total events received: ${lines.length}`);

  // Count key event types for function call analysis
  const transcriptDeltas = lines.filter(line => line.includes('inputTranscription')).length;
  const audioDeltas = lines.filter(line => line.includes('modelTurn')).length;
  const audioTranscriptDeltas = lines.filter(line => line.includes('outputTranscription')).length;
  const functionCalls = lines.filter(line =>
    line.includes('toolCall') &&
    line.includes('functionCalls')
  ).length;
  const generationComplete = lines.filter(line => line.includes('generationComplete')).length;

  console.log(`[PipelineTestGeminiOAI2FunctionCalls] Event summary (function call analysis):`);
  console.log(`  - Input transcription deltas: ${transcriptDeltas}`);
  console.log(`  - Audio deltas: ${audioDeltas}`);
  console.log(`  - Audio transcript deltas: ${audioTranscriptDeltas}`);
  console.log(`  - Function calls: ${functionCalls}`);
  console.log(`  - Generation complete events: ${generationComplete}`);

  console.log(`[PipelineTestGeminiOAI2FunctionCalls] Function call details:`);
  console.log(`  - Total function calls captured: ${mockClientSocket.functionCallCount}`);
  console.log(`  - Function call IDs: ${mockClientSocket.functionCallIds.join(', ')}`);

  return {
    combination: 'Gemini API Style + OpenAI Provider (2 Function Calls Test)',
    totalEvents: lines.length,
    eventSummary: mockClientSocket.eventSummary,
    functionCallAnalysis: {
      transcriptDeltas,
      audioDeltas,
      audioTranscriptDeltas,
      functionCalls,
      generationComplete,
      functionCallCount: mockClientSocket.functionCallCount,
      functionCallIds: mockClientSocket.functionCallIds
    },
    logFile: mockClientSocket.logFile
  };
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('[PipelineTestGeminiOAI2FunctionCalls] Received SIGINT, exiting...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('[PipelineTestGeminiOAI2FunctionCalls] Received SIGTERM, exiting...');
  process.exit(0);
});

// Run if called directly
if (require.main === module) {
  runPipelineTestGeminiOAI2FunctionCalls().catch(error => {
    console.error('❌ Pipeline test Gemini-OpenAI 2 Function Calls failed:', error);
    process.exit(1);
  });
}