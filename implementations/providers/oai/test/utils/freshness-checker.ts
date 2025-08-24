import fs from 'fs';
import path from 'path';

/**
 * Freshness checker utility to validate that baseline files are recent enough
 */
export class FreshnessChecker {
  private static readonly MAX_AGE_HOURS = 2;
  private static readonly LAST_RUN_FILE = 'last-run.txt';

  /**
   * Checks if the last-run.txt file exists and is less than 2 hours old
   * @param testAssetsDir - Directory containing the last-run.txt file
   * @returns true if fresh, false otherwise
   */
  static isBaselineFresh(testAssetsDir: string): boolean {
    const lastRunPath = path.join(testAssetsDir, this.LAST_RUN_FILE);
    
    if (!fs.existsSync(lastRunPath)) {
      return false;
    }

    const stats = fs.statSync(lastRunPath);
    const now = new Date();
    const ageMs = now.getTime() - stats.mtime.getTime();
    const ageHours = ageMs / (1000 * 60 * 60);
    
    return ageHours < this.MAX_AGE_HOURS;
  }

  /**
   * Updates the last-run.txt file with current timestamp
   * @param testAssetsDir - Directory to write the last-run.txt file
   */
  static updateLastRun(testAssetsDir: string): void {
    const lastRunPath = path.join(testAssetsDir, this.LAST_RUN_FILE);
    const timestamp = new Date().toISOString();
    fs.writeFileSync(lastRunPath, `Last baseline run: ${timestamp}\n`);
  }

  /**
   * Gets the age of the last-run.txt file in hours
   * @param testAssetsDir - Directory containing the last-run.txt file
   * @returns age in hours, or -1 if file doesn't exist
   */
  static getBaselineAgeHours(testAssetsDir: string): number {
    const lastRunPath = path.join(testAssetsDir, this.LAST_RUN_FILE);
    
    if (!fs.existsSync(lastRunPath)) {
      return -1;
    }

    const stats = fs.statSync(lastRunPath);
    const now = new Date();
    const ageMs = now.getTime() - stats.mtime.getTime();
    return ageMs / (1000 * 60 * 60);
  }
}