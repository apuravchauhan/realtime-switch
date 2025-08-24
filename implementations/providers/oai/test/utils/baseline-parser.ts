import fs from 'fs';
import path from 'path';
import { ProvidersEvent } from '@realtime-switch/core';

/**
 * Utility for parsing baseline event log files
 */
export class BaselineParser {
  /**
   * Gets the most recent baseline log file from the test assets directory
   * @param testAssetsDir - Directory containing baseline log files
   * @returns Path to the most recent baseline log file
   */
  static getMostRecentBaselineFile(testAssetsDir: string): string {
    const files = fs.readdirSync(testAssetsDir)
      .filter(file => file.startsWith('baseline-events-') && file.endsWith('.log'))
      .map(file => ({
        name: file,
        path: path.join(testAssetsDir, file),
        mtime: fs.statSync(path.join(testAssetsDir, file)).mtime
      }))
      .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

    if (files.length === 0) {
      throw new Error('No baseline log files found in test assets directory');
    }

    return files[0].path;
  }

  /**
   * Parses a baseline log file and returns all events
   * @param logFilePath - Path to the baseline log file
   * @returns Array of parsed events
   */
  static parseBaselineFile(logFilePath: string): ProvidersEvent[] {
    const content = fs.readFileSync(logFilePath, 'utf-8');
    const lines = content.trim().split('\n').filter(line => line.trim());
    
    return lines.map(line => {
      try {
        return JSON.parse(line) as ProvidersEvent;
      } catch (error) {
        throw new Error(`Failed to parse baseline event: ${line}. Error: ${error}`);
      }
    });
  }

  /**
   * Filters events by type
   * @param events - Array of events to filter
   * @param eventType - Type of event to filter for
   * @returns Filtered array of events
   */
  static filterEventsByType(events: ProvidersEvent[], eventType: string): ProvidersEvent[] {
    return events.filter(event => event.payload.type === eventType);
  }

  /**
   * Searches for events containing specific text in their transcript or content
   * @param events - Array of events to search
   * @param searchText - Text to search for (case insensitive)
   * @returns Array of matching events
   */
  static findEventsWithText(events: ProvidersEvent[], searchText: string): ProvidersEvent[] {
    const searchLower = searchText.toLowerCase();
    
    return events.filter(event => {
      const payload = event.payload as any;
      
      // Check transcript fields
      if (payload.transcript && typeof payload.transcript === 'string') {
        return payload.transcript.toLowerCase().includes(searchLower);
      }
      
      // Check delta fields (for streaming transcript)
      if (payload.delta && typeof payload.delta === 'string') {
        return payload.delta.toLowerCase().includes(searchLower);
      }
      
      // Check text content in response items
      if (payload.item && payload.item.content) {
        const content = Array.isArray(payload.item.content) ? payload.item.content : [payload.item.content];
        return content.some((c: any) => 
          c.text && typeof c.text === 'string' && c.text.toLowerCase().includes(searchLower)
        );
      }
      
      return false;
    });
  }

  /**
   * Checks if events contain valid base64 data
   * @param events - Array of events to check
   * @returns Array of events with valid base64 audio data
   */
  static findEventsWithValidBase64Audio(events: ProvidersEvent[]): ProvidersEvent[] {
    return events.filter(event => {
      const payload = event.payload as any;
      
      // Check for audio field with base64 data
      if (payload.audio && typeof payload.audio === 'string') {
        try {
          // Basic base64 validation - try to decode
          Buffer.from(payload.audio, 'base64');
          return payload.audio.length > 0;
        } catch {
          return false;
        }
      }
      
      // Check for delta audio in streaming responses
      if (payload.delta && typeof payload.delta === 'string' && payload.type?.includes('audio')) {
        try {
          Buffer.from(payload.delta, 'base64');
          return payload.delta.length > 0;
        } catch {
          return false;
        }
      }
      
      return false;
    });
  }
}