export interface AiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AiProvider {
  chat(messages: AiMessage[]): Promise<string>;
}
