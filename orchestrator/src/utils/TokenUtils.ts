import * as crypto from 'crypto';
import { Config, ConfigKeys } from '@realtime-switch/core';

export class TokenUtils {
  private static readonly ALGORITHM = 'aes-256-cbc';
  private static config = Config.getInstance();

  /**
   * Gets the encryption key for a specific version
   */
  private static getKeyForVersion(version: string): string {
    const keyConfigName = `SYSTEM_TOKEN_KEY_${version.toUpperCase()}`;
    const key = this.config.getEnv(keyConfigName);
    if (!key) {
      throw new Error(`No key found for version: ${version}`);
    }
    return key;
  }

  /**
   * Gets the current version for new tokens
   */
  private static getCurrentVersion(): string {
    const currentVersion = this.config.get(ConfigKeys.SYSTEM_TOKEN_KEY_CURRENT);
    if (!currentVersion) {
      throw new Error('SYSTEM_TOKEN_KEY_CURRENT not configured');
    }
    return currentVersion;
  }

  /**
   * Creates encrypted system token with any data
   * @param tokenData Any serializable data to encrypt
   * @returns Versioned encrypted token string (e.g., "v1-abc123...")
   */
  static createSystemToken(tokenData: any): string {
    try {
      const currentVersion = this.getCurrentVersion();
      const systemKey = this.getKeyForVersion(currentVersion);

      // Create cipher with system key
      const key = crypto.scryptSync(systemKey, 'salt', 32);
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv(this.ALGORITHM, key, iv);

      // Encrypt the data
      const dataString = JSON.stringify(tokenData);
      let encrypted = cipher.update(dataString, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      // Combine IV and encrypted data
      const result = iv.toString('hex') + ':' + encrypted;
      
      // Return versioned token: version-base64encodeddata
      const base64Token = Buffer.from(result).toString('base64url');
      return `${currentVersion}-${base64Token}`;

    } catch (error) {
      throw new Error(`Failed to create system token: ${error}`);
    }
  }

  /**
   * Validates and decrypts versioned system token
   * @param token Versioned encrypted token string (e.g., "v1-abc123...")
   * @returns Object with validation result and decrypted data
   */
  static validateSystemToken(token: string): { valid: boolean; data?: any; error?: string } {
    try {
      // Split version from token data
      const tokenParts = token.split('-');
      if (tokenParts.length < 2) {
        return { valid: false, error: 'Invalid token format - missing version' };
      }

      const version = tokenParts[0];
      const base64Token = tokenParts.slice(1).join('-'); // Rejoin in case token contains dashes

      // Get the key for this version
      const systemKey = this.getKeyForVersion(version);

      // Decode from base64url
      const decodedToken = Buffer.from(base64Token, 'base64url').toString();
      
      // Split IV and encrypted data
      const parts = decodedToken.split(':');
      if (parts.length !== 2) {
        return { valid: false, error: 'Invalid token format' };
      }

      const iv = Buffer.from(parts[0], 'hex');
      const encrypted = parts[1];

      // Create decipher with system key
      const key = crypto.scryptSync(systemKey, 'salt', 32);
      const decipher = crypto.createDecipheriv(this.ALGORITHM, key, iv);

      // Decrypt the data
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      // Parse JSON data
      const data = JSON.parse(decrypted);

      return { valid: true, data };

    } catch (error) {
      return { valid: false, error: `Token validation failed: ${error}` };
    }
  }

  /**
   * Generate magic link token with email and timestamp (5min expiry)
   * @param email User email
   * @returns Encrypted magic token
   */
  static createMagicToken(email: string): string {
    const tokenData = {
      email,
      timestamp: Date.now()
    };

    return this.createSystemToken(tokenData);
  }

  /**
   * Generate session cookie token with account ID and email (24hr expiry)
   * @param accountId Account identifier
   * @param email User email
   * @returns Encrypted session token
   */
  static createSessionToken(accountId: string, email: string): string {
    const tokenData = {
      accountId,
      email,
      timestamp: Date.now()
    };

    return this.createSystemToken(tokenData);
  }

  /**
   * Validate magic token and extract email if valid (5min expiry)
   * @param token Magic token
   * @returns Validation result with email if valid
   */
  static validateMagicToken(token: string): { valid: boolean; email?: string; error?: string } {
    const result = this.validateSystemToken(token);
    
    if (!result.valid) {
      return result;
    }

    // Check expiry - 5 minutes from timestamp
    const expiresAt = result.data.timestamp + (5 * 60 * 1000);
    if (expiresAt < Date.now()) {
      return { valid: false, error: 'Token expired' };
    }

    return { valid: true, email: result.data.email };
  }

  /**
   * Validate session token and extract account ID and email if valid (24hr expiry)
   * @param token Session token
   * @returns Validation result with account ID and email if valid
   */
  static validateSessionToken(token: string): { valid: boolean; accountId?: string; email?: string; error?: string } {
    const result = this.validateSystemToken(token);
    
    if (!result.valid) {
      return result;
    }

    // Check expiry - 24 hours from timestamp
    const expiresAt = result.data.timestamp + (24 * 60 * 60 * 1000);
    if (expiresAt < Date.now()) {
      return { valid: false, error: 'Session expired' };
    }

    return { valid: true, accountId: result.data.accountId, email: result.data.email };
  }
}