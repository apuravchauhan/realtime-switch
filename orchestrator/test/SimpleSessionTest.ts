// Simple test without provider connections to test just the merging logic

import { Pipeline } from '../src/Pipeline';
import { EventManager, Providers, ProvidersEvent } from '@realtime-switch/core';

// Mock event manager that doesn't connect to anything
class MockEventManager extends EventManager {
  receiveEvent(event: ProvidersEvent): void {
    console.log(`Mock received:`, event.payload);
  }
}

// Test the session merging logic directly
function testSessionMergingDirectly() {
  console.log('🧪 Direct Session Merging Test\n');
  
  const mockSocket = new MockEventManager();
  
  // Create a pipeline instance but access the private method via any cast for testing
  const pipeline = new Pipeline(Providers.OPENAI, 'test-session', mockSocket, Providers.OPENAI);
  const pipelineAny = pipeline as any;
  
  // Test the merging logic directly
  console.log('📋 Test 1: First session update');
  const event1: ProvidersEvent = {
    src: Providers.OPENAI,
    payload: {
      type: "session.update",
      session: {
        voice: "alloy",
        modalities: ["text", "audio"],
        instructions: "You are helpful"
      }
    }
  };
  pipelineAny.mergeSessionConfiguration(event1);
  console.log('Stored config:', pipelineAny.sessionConfiguration?.payload?.session);
  
  console.log('\n📋 Test 2: Update voice only');
  const event2: ProvidersEvent = {
    src: Providers.OPENAI,
    payload: {
      type: "session.update", 
      session: {
        voice: "nova"
      }
    }
  };
  pipelineAny.mergeSessionConfiguration(event2);
  console.log('Merged config:', pipelineAny.sessionConfiguration?.payload?.session);
  
  console.log('\n📋 Test 3: Add tools');
  const event3: ProvidersEvent = {
    src: Providers.OPENAI,
    payload: {
      type: "session.update",
      session: {
        tools: [{ type: "function", name: "get_weather" }]
      }
    }
  };
  pipelineAny.mergeSessionConfiguration(event3);
  console.log('Final config:', pipelineAny.sessionConfiguration?.payload?.session);
  
  // Verify expected state
  const finalSession = pipelineAny.sessionConfiguration?.payload?.session;
  if (finalSession) {
    console.log('\n✅ Verification:');
    console.log(`Voice: ${finalSession.voice} (should be "nova")`);
    console.log(`Modalities: ${JSON.stringify(finalSession.modalities)} (should be ["text", "audio"])`);
    console.log(`Instructions: "${finalSession.instructions}" (should be "You are helpful")`);
    console.log(`Tools: ${finalSession.tools ? 'Present' : 'Missing'} (should be Present)`);
    
    if (finalSession.voice === "nova" && 
        finalSession.instructions === "You are helpful" && 
        finalSession.tools?.length === 1) {
      console.log('\n🎉 Session merging logic WORKS CORRECTLY!');
    } else {
      console.log('\n❌ Session merging logic FAILED');
    }
  }
}

testSessionMergingDirectly();