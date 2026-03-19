/**
 * LLM Client — Ollama (ücretsiz, local) veya Claude API
 * Tüm agent'lar bu modülü kullanır
 */

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.1:8b';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OllamaResponse {
  message: { content: string };
}

export async function chat(system: string, userMessage: string): Promise<string> {
  const messages: ChatMessage[] = [
    { role: 'system', content: system },
    { role: 'user', content: userMessage },
  ];

  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages,
      stream: false,
      options: {
        temperature: 0.8,
        num_predict: 512,
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`Ollama hatası: ${res.status} ${await res.text()}`);
  }

  const data = await res.json() as OllamaResponse;
  return data.message.content;
}
