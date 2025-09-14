import dotenv from 'dotenv';
import { ConfigKeys } from './ConfigKeys';
import { Logger } from '../Logger';

const CLASS_NAME = 'Config';

dotenv.config();

export class Config {
  private static instance: Config;
  private config: Map<ConfigKeys, string> = new Map();

  private constructor() {
    this.loadFromProcessEnv();
  }

  static getInstance(): Config {
    if (!Config.instance) {
      Config.instance = new Config();
    }
    return Config.instance;
  }
  private loadFromProcessEnv(): void {
    Object.values(ConfigKeys).forEach(key => {
      const value = process.env[key];
      if (value) {
        this.config.set(key, value);
      }
    });
  }

  get(key: ConfigKeys): string | undefined {
    const value = this.config.get(key);
    if (!value) {
      Logger.error(CLASS_NAME, null, 'Required configuration key {} not found', new Error('Config key not found'), key);
      return undefined;
    }
    return value;
  }

  // Get any environment variable by string key (for dynamic versioned keys)
  getEnv(key: string): string | undefined {
    return process.env[key];
  }
}