import { EventManager, ProvidersEvent, Providers, ClientEventsExtractor, Persistence } from '@realtime-switch/core';
import { BaseCheckpoint } from '@realtime-switch/checkpoint';
import { FilePersistence } from '@realtime-switch/checkpoint';
import { ExtractorRegistry } from './registries';

export class SessionManager extends EventManager {
  private sessionConfiguration: ProvidersEvent | null = null;
  private extractor: ClientEventsExtractor | null;
  private apiStyle: Providers;
  private sessionId: string;
  private sessionPersistence: Persistence;

  constructor(apiStyle: Providers, sessionId: string) {
    super();
    this.apiStyle = apiStyle;
    this.sessionId = sessionId;

    // ✅ Initialize session persistence
    this.sessionPersistence = BaseCheckpoint.getPersistence();

    // ✅ SessionManager gets its own CLIENT extractor for session events  
    this.extractor = ExtractorRegistry.getClientExtractor(apiStyle);

    // ✅ Register callback to intercept session updates
    if (this.extractor) {
      this.extractor.onSessionUpdate((event) => this.handleSessionUpdate(event));
    }

    // ✅ Load existing session configuration if available
    this.loadSessionConfiguration();
  }

  receiveEvent(event: ProvidersEvent): void {
    // ✅ Process through extractor (might trigger session handling)
    if (this.extractor) {
      this.extractor.extract(event);
    }

    // ✅ Always forward event to subscribers (ClientTransformer)
    this.emitEvent(event);
  }

  private handleSessionUpdate(event: ProvidersEvent): void {
    // ✅ Merge session configuration (now async but don't block event flow)
    this.mergeSessionConfiguration(event).catch(error => {
      console.error('[SessionManager] Failed to merge session configuration:', error);
    });

    // Event continues to flow to subscribers normally
  }

  private async mergeSessionConfiguration(event: ProvidersEvent): Promise<void> {
    if (!this.sessionConfiguration) {
      // First session update - store as is
      this.sessionConfiguration = { ...event };
      console.log(`[SessionManager] Initial session config captured for ${event.src}:`, event.payload);
    } else {
      // Merge session configurations
      const existingSession = this.sessionConfiguration.payload.session || {};
      const newSession = event.payload.session || {};

      const mergedSession = { ...existingSession, ...newSession };

      this.sessionConfiguration = {
        ...this.sessionConfiguration,
        payload: {
          ...event.payload,
          session: mergedSession
        }
      };

      console.log(`[SessionManager] Merged session config for ${event.src}:`, {
        previous: existingSession,
        new: newSession,
        merged: mergedSession
      });
    }

    // ✅ Persist session configuration (non-blocking)
    this.saveSessionConfiguration().catch(error => {
      console.error('[SessionManager] Failed to save session configuration:', error);
    });
  }

  // ✅ Save session configuration to persistence
  private async saveSessionConfiguration(): Promise<void> {
    if (this.sessionConfiguration) {
      const content = JSON.stringify(this.sessionConfiguration, null, 2);
      await this.sessionPersistence.overwrite('sessions', this.sessionId, content);
      console.log(`[SessionManager] Session configuration saved for ${this.sessionId}`);
    }
  }

  // ✅ Load session configuration from persistence
  private async loadSessionConfiguration(): Promise<void> {
    try {
      const content = await this.sessionPersistence.read('sessions', this.sessionId);

      if (content) {
        this.sessionConfiguration = JSON.parse(content);
        console.log(`[SessionManager] Session configuration loaded for ${this.sessionId}:`, this.sessionConfiguration?.payload);
      }
    } catch (error) {
      console.error(`[SessionManager] Failed to load session configuration:`, error);
    }
  }

  // ✅ Provide access to session config for replay with conversation history
  async getSessionConfiguration(): Promise<ProvidersEvent | null> {
    // ✅ Always check persistence first in case of updates from other instances
    await this.loadSessionConfiguration();

    if (!this.sessionConfiguration) {
      return null;
    }

    const conversationHistory = await BaseCheckpoint.loadConversationHistory(this.sessionId);

    if (conversationHistory) {
      // Deep copy - only safe way with unknown user structures
      const enrichedConfig = JSON.parse(JSON.stringify(this.sessionConfiguration));

      const contextPrompt = `\n\nHere is the previous conversation that happened which should be continued now:\n${conversationHistory}`;

      if (this.apiStyle === Providers.OPENAI) {
        // User could have sent ANY session structure
        if (enrichedConfig.payload.session) {
          enrichedConfig.payload.session.instructions = (enrichedConfig.payload.session.instructions || '') + contextPrompt;
        }
      }
      else if (this.apiStyle === Providers.GEMINI) {
        // User could have sent ANY setup structure  
        if (enrichedConfig.payload.setup?.systemInstruction?.parts?.[0]) {
          enrichedConfig.payload.setup.systemInstruction.parts[0].text = (enrichedConfig.payload.setup.systemInstruction.parts[0].text || '') + contextPrompt;
        }
      }

      return enrichedConfig;
    }

    return this.sessionConfiguration;
  }

  cleanup(): void {
    super.cleanup();
    if (this.extractor) {
      this.extractor.cleanup();
      this.extractor = null;
    }
    this.sessionConfiguration = null;
  }
}