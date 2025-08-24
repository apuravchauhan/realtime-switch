import * as crypto from 'crypto';
import { Config } from '../config/Config';
import { ConfigKeys } from '../config/ConfigKeys';
import { AccountManager } from './AccountManager';
import { AuthStatus } from './AuthStatus';

/**
 * Authentication service that handles HMAC-based WebSocket authentication
 * using account secret keys from both .env configuration and database fallback
 */
export class AuthService {
  private accountKeys: Map<string, string>;
  private accountManager: AccountManager;
  private config: Config;

  constructor(accountManager: AccountManager) {
    this.accountManager = accountManager;
    this.config = Config.getInstance();
    this.accountKeys = this.loadAccountKeysFromConfig();
  }

  /**
   * Load account keys from environment configuration
   * @returns Map of accountId to secret key pairs
   */
  private loadAccountKeysFromConfig(): Map<string, string> {
    const accountKeys = new Map<string, string>();
    const accountsConfig = this.config.get(ConfigKeys.ACCOUNTS) || '';
    
    if (accountsConfig) {
      accountsConfig.split(',').forEach((pair: string) => {
        const [accountId, secretKey] = pair.split('=');
        if (accountId && secretKey) {
          accountKeys.set(accountId.trim(), secretKey.trim());
        }
      });
    }
    
    return accountKeys;
  }

  /**
   * Gets account secret key, first from .env config, then from database
   * @param accountId Account identifier
   * @returns Secret key or null if not found
   */
  private async getAccountKey(accountId: string): Promise<string | null> {
    // First check .env config (existing behavior)
    const envKey = this.accountKeys.get(accountId);
    if (envKey) {
      return envKey;
    }

    // Fallback to AccountManager lookup if not found in .env
    try {
      const account = await this.accountManager.getAccount(accountId);
      return account ? account.key : null;
    } catch (error) {
      console.error(`[Auth] Error fetching account from database: ${error}`);
      return null;
    }
  }

  /**
   * Get the count of loaded account keys from configuration
   * @returns Number of account keys loaded from .env
   */
  getAccountKeysCount(): number {
    return this.accountKeys.size;
  }

  /**
   * Validates HMAC authentication for WebSocket connections
   * @param authToken Client-provided HMAC hash
   * @param accountId Account identifier
   * @param sessionId Session identifier used in HMAC calculation
   * @returns Authentication status with optional error message
   */
  async validateAuth(authToken: string, accountId: string, sessionId: string): Promise<AuthStatus> {
    try {
      // Get account secret key
      const accountKey = await this.getAccountKey(accountId);
      if (!accountKey) {
        console.log(`[Auth] Invalid account ID: ${accountId}`);
        return { status: false, error: 'Invalid account ID' };
      }

      // Generate expected auth hash using HMAC-SHA256
      const expectedAuth = crypto.createHmac('sha256', accountKey).update(sessionId).digest('hex');

      // Constant-time comparison to prevent timing attacks
      const isValid = crypto.timingSafeEqual(
        Buffer.from(authToken, 'hex'),
        Buffer.from(expectedAuth, 'hex')
      );

      if (!isValid) {
        console.log(`[Auth] Authentication failed for account: ${accountId}, session: ${sessionId}`);
        return { status: false, error: 'Authentication failed' };
      }

      return { status: true };

    } catch (error) {
      console.error(`[Auth] Error during authentication: ${error}`);
      return { status: false, error: 'Authentication error' };
    }
  }
}