export type LogLevel = 'debug' | 'warn' | 'error';

export class Logger {
  // Constants to avoid repeated string allocation
  private static readonly DEBUG = 'debug' as const;
  private static readonly WARN = 'warn' as const;
  private static readonly ERROR = 'error' as const;

  private static level: LogLevel = Logger.ERROR;
  private static accId: string | null = null;

  private static readonly LEVELS: Record<LogLevel, number> = {
    debug: 0,
    warn: 1,
    error: 2
  };


  /**
   * Set the minimum log level. Logs at this level and above will be printed.
   * @param level - The minimum log level ('debug', 'warn', 'error')
   */
  static setLevel(level: LogLevel): void {
    Logger.level = level;
  }

  /**
   * Set the account ID filter. If set, all logs for this account will be printed regardless of level.
   * @param accId - The account ID to filter for, or null to disable filtering
   */
  static setAccountFilter(accId: string | null): void {
    Logger.accId = accId;
  }

  /**
   * Check if a log should be printed based on level and account filtering
   */
  private static shouldLog(level: LogLevel, accId: string | null): boolean {
    // If account filter is set and matches, print regardless of level
    if (Logger.accId !== null && Logger.accId === accId) {
      return true;
    }

    // Otherwise check if the log level meets the minimum threshold
    return Logger.LEVELS[level] >= Logger.LEVELS[Logger.level];
  }

  /**
   * Log a debug message with deferred evaluation
   * @param className - Name of the class calling the logger
   * @param accId - Account ID (null if not available)
   * @param message - Template string with {} placeholders
   * @param args - Arguments for string interpolation (only evaluated if logging)
   */
  static debug(className: string, accId: string | null, message: string, ...args: any[]): void {
    if (Logger.shouldLog(Logger.DEBUG, accId)) {
      console.log(`[${className}] ${Logger.formatMessage(message, args)}`);
    }
  }

  /**
   * Log a warning message with deferred evaluation
   * @param className - Name of the class calling the logger
   * @param accId - Account ID (null if not available)
   * @param message - Template string with {} placeholders
   * @param args - Arguments for string interpolation (only evaluated if logging)
   */
  static warn(className: string, accId: string | null, message: string, ...args: any[]): void {
    if (Logger.shouldLog(Logger.WARN, accId)) {
      console.warn(`[${className}] ${Logger.formatMessage(message, args)}`);
    }
  }

  /**
   * Log an error message with deferred evaluation
   * @param className - Name of the class calling the logger
   * @param accId - Account ID (null if not available)
   * @param message - Template string with {} placeholders
   * @param error - Error object
   * @param args - Arguments for string interpolation (only evaluated if logging)
   */
  static error(className: string, accId: string | null, message: string, error: Error, ...args: any[]): void {
    if (Logger.shouldLog(Logger.ERROR, accId)) {
      console.error(`[${className}] ${Logger.formatMessage(message, args)}`);
      if (error && error.stack) {
        console.error(error.stack);
      }
    }
  }

  /**
   * Format message with arguments - only called when logging is enabled
   * @param message - Template string with {} placeholders (kept for readability)
   * @param args - Arguments to append in simple format
   */
  private static formatMessage(message: string, args: any[]): string {
    return args.length ? `${message} - {${args.join(', ')}}` : message;
  }

  /**
   * Get current log level
   */
  static getLevel(): LogLevel {
    return Logger.level;
  }

  /**
   * Get current account filter
   */
  static getAccountFilter(): string | null {
    return Logger.accId;
  }
}