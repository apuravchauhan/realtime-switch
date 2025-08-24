const crypto = require('crypto');
const WebSocket = require('ws');

// Test credentials (matching .env and HTML client)
const ACCOUNT_ID = '996-sdassds-86-asd';
const SECRET_KEY = 'secretkey-996';
const SESSION_ID = 'test-session-browser'; // Same as HTML client

// Generate authentication hash
function generateAuthHash(accountId, secretKey, sessionId) {
  return crypto.createHmac('sha256', secretKey).update(sessionId).digest('hex');
}

// Create auth headers
const authHash = generateAuthHash(ACCOUNT_ID, SECRET_KEY, SESSION_ID);
console.log('🔐 Generated auth hash:', authHash);

// Connect to WebSocket with query parameters
const wsUrl = `ws://localhost:3000?rs_accid=${ACCOUNT_ID}&rs_u_sessid=${SESSION_ID}&rs_auth=${authHash}&rs_api=OPENAI&rs_core=OPENAI`;

console.log('🔗 Connecting to:', wsUrl);

const ws = new WebSocket(wsUrl);

ws.on('open', () => {
  console.log('✅ WebSocket connected successfully!');
  
  // Test sending a session update
  const sessionUpdate = {
    type: "session.update",
    session: {
      modalities: ["text", "audio"],
      instructions: "You are a helpful assistant"
    }
  };
  
  console.log('📤 Sending session update...');
  ws.send(JSON.stringify(sessionUpdate));
});

ws.on('message', (data) => {
  console.log('📥 Received:', data.toString());
});

ws.on('error', (error) => {
  console.error('❌ WebSocket error:', error);
});

ws.on('close', (code, reason) => {
  console.log(`🔌 Connection closed: ${code} - ${reason}`);
});

// Keep alive for testing
setTimeout(() => {
  console.log('🛑 Closing connection...');
  ws.close();
}, 10000);