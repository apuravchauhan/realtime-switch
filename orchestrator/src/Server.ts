import * as uWS from 'uWebSockets.js';
import { Config, ConfigKeys, Providers } from '@realtime-switch/core';
import { Pipeline } from './Pipeline';
import SocketEventManager from './SocketEventManager';
import { AuthService } from '@realtime-switch/core';
import { FirestoreAccountManager } from '@realtime-switch/accounts';
import { Banner } from './Banner';

// Global Error Handlers
process.on('uncaughtException', (error) => {
  console.error('🚨 [Server] Uncaught Exception:', error);
  console.error('Stack:', error.stack);
  console.error('⚠️ [Server] Continuing after uncaught exception - consider fixing the root cause');
  // Don't exit - log and continue running
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('🚨 [Server] Unhandled Promise Rejection at:', promise);
  console.error('🚨 [Server] Reason:', reason);
  // Don't exit on unhandled rejections, just log them
});

process.on('SIGTERM', async () => {
  console.log('📡 [Server] Received SIGTERM, shutting down gracefully...');
  await gracefulShutdown();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('📡 [Server] Received SIGINT (Ctrl+C), shutting down gracefully...');
  await gracefulShutdown();
  process.exit(0);
});

// Graceful shutdown handler
async function gracefulShutdown() {
  try {
    console.log('🧹 [Server] Starting graceful shutdown...');

    // Import SQLitePersistence for singleton cleanup
    const { SQLitePersistence } = await import('@realtime-switch/checkpoint');

    // Shutdown singleton resources
    await SQLitePersistence.shutdown();
    console.log('✅ [Server] SQLitePersistence singleton shut down');

    console.log('✅ [Server] Graceful shutdown completed');
  } catch (error) {
    console.error('❌ [Server] Error during graceful shutdown:', error);
  }
}

const config = Config.getInstance();
const port = parseInt(config.get(ConfigKeys.PORT) || '3000');
const host = config.get(ConfigKeys.HOST) || 'localhost';
Banner.displayStartupBanner();


type UserData = {
  apiStyle: string,
  provider: string,
  id: string,
  accountId: string,
  pipeline: Pipeline
}

// Initialize account manager and authentication service
const enableDb = config.get(ConfigKeys.ENABLE_DB)?.toLowerCase() === 'true';
const accountManager = enableDb ? new FirestoreAccountManager() : null;
const authService = new AuthService(accountManager);

const app = uWS.App()
  .ws('/*', {
    compression: uWS.SHARED_COMPRESSOR,
    maxPayloadLength: 2 * 1024 * 1024,
    idleTimeout: 10,
    upgrade: async (res, req, context) => {
      // Set abort handler FIRST
      res.onAborted(() => {
        res.aborted = true;
      });

      // Get authentication from query parameters
      const accountId = req.getQuery('rs_accid');
      const sessionId = req.getQuery('rs_u_sessid');
      const authHash = req.getQuery('rs_auth');
      const apiStyle = req.getQuery('rs_api') || 'OPENAI';
      const provider = req.getQuery('rs_core') || apiStyle;

      //  console.log(`[Auth] Upgrade attempt - Account: ${accountId}, Session: ${sessionId}`);

      // Validate required parameters
      if (!accountId || !sessionId || !authHash) {
        console.log(`[Auth] Missing required query parameters`);
        if (!res.aborted) {
          res.writeStatus('400 Bad Request').end('Missing authentication parameters: rs_accid, rs_u_sessid, rs_auth required');
        }
        return;
      }

      // Validate authentication using AuthService

      const authResult = await authService.validateAuth(authHash, accountId, sessionId);

      if (!authResult.status) {
        if (!res.aborted) {
          res.writeStatus('403 Forbidden').end(authResult.error || 'Invalid authentication');
        }
        return;
      }

      // console.log(`[Auth] Authentication successful for account: ${accountId}`);

      // Upgrade to WebSocket - after await operations
      if (!res.aborted) {
        res.upgrade({
          apiStyle: apiStyle,
          provider: provider,
          id: sessionId,
          accountId: accountId
        } as UserData,
          req.getHeader('sec-websocket-key'),
          req.getHeader('sec-websocket-protocol'),
          req.getHeader('sec-websocket-extensions'),
          context);
      }
    },
    open: (ws: uWS.WebSocket<UserData>) => {
      const userData = ws.getUserData();

      // Validate apiStyle and provider
      const validProviders = Object.values(Providers) as string[];
      if (!validProviders.includes(userData.apiStyle)) {
        ws.send(`Invalid API Style - Available {${validProviders.join(', ')}}`);
        ws.close();
        return;
      }
      if (!validProviders.includes(userData.provider)) {
        ws.send(`Invalid Provider - Available {${validProviders.join(', ')}}`);
        ws.close();
        return;
      }

      const selectedApiStyle = userData.apiStyle as Providers;
      const selectedProvider = userData.provider as Providers;

      // console.log(`[WebSocket] Connected - Account: ${userData.accountId}, Session: ${userData.id}, API Style: ${selectedApiStyle}, Provider: ${selectedProvider}`);
      const socketEventManager = new SocketEventManager(ws);
      const sessionId = userData.id;
      const accId = userData.accountId;

      const pipeline = new Pipeline(selectedApiStyle, accId, sessionId, socketEventManager, selectedProvider);
      userData.pipeline = pipeline
    },
    message: (ws: uWS.WebSocket<UserData>, message, isBinary) => {
      if (!isBinary) {
        try {
          const jsonString = Buffer.from(message).toString('utf-8');
          const event = JSON.parse(jsonString);
          ws.getUserData().pipeline.receiveEvent(event);
        } catch (error) {
          console.error('Error parsing JSON message:', error);
        }
      }
    },
    drain: (ws) => {
      console.log('WebSocket backpressure:', ws.getBufferedAmount());
    },
    close: (ws, code, message) => {
      const userData = ws.getUserData();
      console.log(`🔌 [Server] WebSocket closed - Session: ${userData.id}, Account: ${userData.accountId}, Provider: ${userData.provider}, Code: ${code}`);

      // Cleanup pipeline and all associated resources
      if (userData.pipeline) {
        try {
          userData.pipeline.cleanup();
          console.log(`✅ [Server] Pipeline cleanup completed for session: ${userData.id}`);
        } catch (error) {
          console.error(`❌ [Server] Pipeline cleanup failed for session: ${userData.id}:`, error);
        }
      } else {
        console.warn(`⚠️ [Server] No pipeline found for session: ${userData.id}`);
      }

      // Clear userData references to prevent memory leaks  
      userData.pipeline = null as any;

      console.log(`🧹 [Server] Session ${userData.id} cleanup completed`);
    }
  })
  // Fallback for unknown routes
  .any('/*', (res, req) => {
    res.writeStatus('404').end('Server is up. Connect via web socket');
  })
  .listen(port, (token) => {
    if (token) {
      Banner.displayServerOnline(host, port, authService.getAccountKeysCount());
    } else {
      Banner.displayServerError(port);
      process.exit(1);
    }
  });