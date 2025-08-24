#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Get all log files from the last test run - check both locations
const testDir = path.join(__dirname);
const parentDir = path.join(__dirname, '..');

const testDirFiles = fs.readdirSync(testDir)
  .filter(file => file.startsWith('pipeline-test-') && file.endsWith('.log'))
  .map(file => ({ file, dir: testDir, path: path.join(testDir, file) }));

const parentDirFiles = fs.readdirSync(parentDir)
  .filter(file => file.startsWith('pipeline-test-') && file.endsWith('.log'))
  .map(file => ({ file, dir: parentDir, path: path.join(parentDir, file) }));

const allFiles = [...testDirFiles, ...parentDirFiles]
  .sort((a, b) => {
    const timeA = fs.statSync(a.path).mtime;
    const timeB = fs.statSync(b.path).mtime;
    return timeB - timeA;
  });

const logFiles = allFiles.map(f => f.file);

// Group log files by test type
const testTypes = {
  'oai-oai': [],
  'oai-gemini': [],
  'gemini-oai': [],
  'gemini-gemini': []
};

allFiles.forEach(({ file, path }) => {
  if (file.includes('oai-oai')) testTypes['oai-oai'].push({ file, path });
  else if (file.includes('oai-gemini')) testTypes['oai-gemini'].push({ file, path });
  else if (file.includes('gemini-oai')) testTypes['gemini-oai'].push({ file, path });
  else if (file.includes('gemini-gemini')) testTypes['gemini-gemini'].push({ file, path });
});

console.log('\n========================================');
console.log('  PIPELINE TEST RESULTS SUMMARY');
console.log('========================================\n');

// Analyze the most recent test for each type
Object.entries(testTypes).forEach(([type, files]) => {
  if (files.length === 0) return;
  
  const latest = files[0];
  const filePath = latest.path;
  const latestFile = latest.file;
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter(line => line.trim());
  
  // Count event types
  const eventCounts = {};
  lines.forEach(line => {
    try {
      const match = line.match(/\[[\d\-T:.Z]+\]\s*(.*)/);
      if (match) {
        const jsonStr = match[1];
        const event = JSON.parse(jsonStr);
        
        // Identify event type
        let eventType = 'unknown';
        
        // Check for wrapped events (from Pipeline)
        if (event.src && event.payload) {
          const payload = event.payload;
          if (payload.type) {
            eventType = payload.type;
          } else if (payload.serverContent) {
            if (payload.serverContent.turnComplete) eventType = 'turnComplete';
            else if (payload.serverContent.generationComplete) eventType = 'generationComplete';
            else if (payload.serverContent.interrupted) eventType = 'interrupted';
            else eventType = 'serverContent';
          } else if (payload.setupComplete) {
            eventType = 'setupComplete';
          }
        } else {
          // Direct events
          if (event.type) {
            eventType = event.type;
          } else if (event.serverContent) {
            if (event.serverContent.turnComplete) eventType = 'turnComplete';
            else if (event.serverContent.generationComplete) eventType = 'generationComplete';
            else if (event.serverContent.interrupted) eventType = 'interrupted';
            else eventType = 'serverContent';
          } else if (event.setupComplete) {
            eventType = 'setupComplete';
          }
        }
        
        eventCounts[eventType] = (eventCounts[eventType] || 0) + 1;
      }
    } catch (e) {
      // Ignore parsing errors
    }
  });
  
  // Format test name
  const [apiStyle, provider] = type.split('-').map(s => s.toUpperCase());
  console.log(`Test: ${apiStyle} API Style + ${provider} Provider`);
  console.log('─'.repeat(40));
  console.log(`Total Events: ${lines.length}`);
  console.log(`Log File: ${latestFile}`);
  console.log(`File Size: ${(fs.statSync(filePath).size / 1024).toFixed(2)} KB`);
  
  if (lines.length > 0) {
    console.log('\nEvent Breakdown:');
    
    // Sort events by count
    const sortedEvents = Object.entries(eventCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10); // Top 10 event types
    
    sortedEvents.forEach(([eventType, count]) => {
      const percentage = ((count / lines.length) * 100).toFixed(1);
      console.log(`  • ${eventType}: ${count} (${percentage}%)`);
    });
    
    // Check for specific patterns
    console.log('\nKey Observations:');
    
    if (apiStyle === 'OAI' && provider === 'GEMINI') {
      const hasResponseDone = eventCounts['response.done'] > 0;
      const hasGenerationComplete = eventCounts['generationComplete'] > 0;
      console.log(`  ✓ Transformation working: ${hasResponseDone ? 'Yes' : 'No'}`);
      console.log(`  ✓ Gemini events transformed: ${!hasGenerationComplete ? 'Yes' : 'No'}`);
    } else if (apiStyle === 'GEMINI' && provider === 'OAI') {
      const hasServerContent = eventCounts['serverContent'] > 0;
      const hasResponseDone = eventCounts['response.done'] > 0;
      console.log(`  ✓ Reverse transformation: ${hasServerContent ? 'Yes' : 'No'}`);
      console.log(`  ✓ OpenAI events transformed: ${!hasResponseDone ? 'Yes' : 'No'}`);
    } else if (apiStyle === provider) {
      console.log(`  ✓ Native ${apiStyle} protocol used`);
      if (apiStyle === 'OAI') {
        console.log(`  ✓ Has response.done events: ${eventCounts['response.done'] > 0 ? 'Yes' : 'No'}`);
        console.log(`  ✓ Has audio delta events: ${eventCounts['response.audio.delta'] > 0 ? 'Yes' : 'No'}`);
      } else {
        console.log(`  ✓ Has setupComplete: ${eventCounts['setupComplete'] > 0 ? 'Yes' : 'No'}`);
        console.log(`  ✓ Has serverContent: ${eventCounts['serverContent'] > 0 ? 'Yes' : 'No'}`);
      }
    }
    
  } else {
    console.log('\n⚠️  No events received - possible timeout or connection issue');
  }
  
  console.log('\n');
});

console.log('========================================');
console.log('\nSUMMARY ANALYSIS:');
console.log('─'.repeat(40));

// Overall analysis
const results = {};
Object.entries(testTypes).forEach(([type, files]) => {
  if (files.length === 0) return;
  const filePath = files[0].path;
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter(line => line.trim());
  results[type] = lines.length;
});

const successful = Object.values(results).filter(count => count > 0).length;
const total = Object.keys(results).length;

console.log(`✓ Tests Completed: ${total}/4`);
console.log(`✓ Tests with Events: ${successful}/4`);
console.log(`✓ Success Rate: ${((successful / total) * 100).toFixed(0)}%`);

if (results['oai-oai'] > 0 && results['oai-gemini'] > 0) {
  console.log(`\n✓ OAI→Gemini Transformation: WORKING`);
}
if (results['gemini-gemini'] > 0) {
  console.log(`✓ Native Gemini Pipeline: WORKING`);
}
if (results['gemini-oai'] === 0) {
  console.log(`\n⚠️  Gemini→OAI Transformation: NO EVENTS`);
  console.log(`   This might be due to OpenAI provider timeout`);
}

console.log('\n========================================\n');