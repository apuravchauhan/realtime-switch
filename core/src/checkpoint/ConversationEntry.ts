export interface ConversationEntry {
  type: 'user' | 'agent' | 'agent_summary' | 'agent_checkpoint';
  content: string;
  timestamp: Date;
  provider?: string;
}