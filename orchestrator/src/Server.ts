import * as uWS from 'uWebSockets.js';
import { Config, ConfigKeys, Providers, Logger } from '@realtime-switch/core';
import { Pipeline } from './Pipeline';
import SocketEventManager from './SocketEventManager';
import { AuthService } from '@realtime-switch/core';
import { FirestoreAccountManager } from '@realtime-switch/accounts';
import { Banner } from './Banner';

// Static class name to avoid repeated string allocations
const CLASS_NAME = 'Server';

// Global Error Handlers
process.on('uncaughtException', (error) => {
  Logger.error(CLASS_NAME, null, '🚨 Uncaught Exception - consider fixing the root cause', error);
  // Don't exit - log and continue running
});

process.on('unhandledRejection', (reason, promise) => {
  const error = reason instanceof Error ? reason : new Error(String(reason));
  Logger.error(CLASS_NAME, null, '🚨 Unhandled Promise Rejection at: {}', error, promise);
  // Don't exit on unhandled rejections, just log them
});

process.on('SIGTERM', async () => {
  Logger.debug(CLASS_NAME, null, '📡 Received SIGTERM, shutting down gracefully...');
  await gracefulShutdown();
  process.exit(0);
});

process.on('SIGINT', async () => {
  Logger.debug(CLASS_NAME, null, '📡 Received SIGINT (Ctrl+C), shutting down gracefully...');
  await gracefulShutdown();
  process.exit(0);
});

// Graceful shutdown handler
async function gracefulShutdown() {
  try {
    Logger.debug(CLASS_NAME, null, '🧹 Starting graceful shutdown...');

    // Import SQLitePersistence for singleton cleanup
    const { SQLitePersistence } = await import('@realtime-switch/checkpoint');

    // Shutdown singleton resources
    await SQLitePersistence.shutdown();
    Logger.debug(CLASS_NAME, null, '✅ SQLitePersistence singleton shut down');

    Logger.debug(CLASS_NAME, null, '✅ Graceful shutdown completed');
  } catch (error) {
    Logger.error(CLASS_NAME, null, '❌ Error during graceful shutdown', error as Error);
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
        Logger.warn(CLASS_NAME, accountId || null, 'Missing required query parameters');
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
          const userData = ws.getUserData();
          Logger.error(CLASS_NAME, userData.accountId || null, 'Error parsing JSON message', error as Error);
        }
      }
    },
    drain: (ws) => {
      const userData = ws.getUserData();
      Logger.debug(CLASS_NAME, userData.accountId || null, 'WebSocket backpressure: {}', ws.getBufferedAmount());
    },
    close: (ws, code, message) => {
      const userData = ws.getUserData();
      Logger.debug(CLASS_NAME, userData.accountId || null, '🔌 WebSocket closed - Session: {}, Provider: {}, Code: {}', userData.id, userData.provider, code);

      // Cleanup pipeline and all associated resources
      if (userData.pipeline) {
        try {
          userData.pipeline.cleanup();
          Logger.debug(CLASS_NAME, userData.accountId || null, '✅ Pipeline cleanup completed for session: {}', userData.id);
        } catch (error) {
          Logger.error(CLASS_NAME, userData.accountId || null, '❌ Pipeline cleanup failed for session: {}', error as Error, userData.id);
        }
      } else {
        Logger.warn(CLASS_NAME, userData.accountId || null, '⚠️ No pipeline found for session: {}', userData.id);
      }

      // Clear userData references to prevent memory leaks
      userData.pipeline = null as any;

      Logger.debug(CLASS_NAME, userData.accountId || null, '🧹 Session {} cleanup completed', userData.id);
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