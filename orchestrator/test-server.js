const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
require('dotenv').config();

// Configuration from .env
const CLIENT_TEST_PORT = process.env.CLIENT_TEST_PORT || 3005;
const REALTIME_SWITCH_PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || 'localhost';

// Simple static file server
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let filePath = path.join(__dirname, 'test', url.pathname === '/' ? 'index.html' : url.pathname);
  
  // Security: prevent directory traversal
  if (!filePath.startsWith(path.join(__dirname, 'test'))) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  // Check if file exists
  fs.access(filePath, fs.constants.F_OK, (err) => {
    if (err) {
      // Try index.html as fallback
      if (url.pathname !== '/') {
        filePath = path.join(__dirname, 'test', 'index.html');
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('File not found');
        return;
      }
    }

    // Serve the file
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal server error');
        return;
      }

      // Set content type based on file extension
      const ext = path.extname(filePath).toLowerCase();
      const contentTypes = {
        '.html': 'text/html',
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.gif': 'image/gif',
        '.wav': 'audio/wav',
        '.mp3': 'audio/mpeg'
      };

      const contentType = contentTypes[ext] || 'text/plain';
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    });
  });
});

// Start server
server.listen(CLIENT_TEST_PORT, HOST, () => {
  // Add PORT query param if different from default
  const portParam = REALTIME_SWITCH_PORT !== '3000' ? `?PORT=${REALTIME_SWITCH_PORT}` : '';
  const testUrl = `http://${HOST}:${CLIENT_TEST_PORT}${portParam}`;
  const serverUrl = `http://${HOST}:${REALTIME_SWITCH_PORT}`;
  
  console.log(`🌐 RealtimeSwitch Test Client running at: ${testUrl}`);
  console.log(`📂 Serving files from: ${path.join(__dirname, 'test')}`);
  console.log(`🔗 Connecting to RealtimeSwitch server at: ${serverUrl}`);
  console.log(`✨ Opening browser...`);
  
  // Open browser automatically
  const openCommand = process.platform === 'darwin' ? 'open' : 
                     process.platform === 'win32' ? 'start' : 'xdg-open';
  
  exec(`${openCommand} ${testUrl}`, (error) => {
    if (error) {
      console.log(`⚠️  Could not open browser automatically. Please navigate to: ${testUrl}`);
    }
  });
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down test server...');
  server.close(() => {
    process.exit(0);
  });
});