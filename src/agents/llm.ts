const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.1:8b';
const TIMEOUT_MS = 90_000;

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OllamaResponse {
  message: { content: string };
}

export function escapeForPrompt(str: string): string {
  return str
    .replace(/[{}[\]]/g, '')     // JSON karıştırıcı karakterler
    .replace(/\\/g, '')           // Backslash
    .replace(/"/g, "'")           // Çift tırnak
    .slice(0, 500);               // Uzunluk limiti
}

export async function chat(system: string, userMessage: string): Promise<string> {
  const messages: ChatMessage[] = [
    { role: 'system', content: system },
    { role: 'user', content: userMessage },
  ];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages,
        stream: false,
        options: { temperature: 0.8, num_predict: 512 },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`Ollama hata: ${res.status}`);
    }

    const data = await res.json() as OllamaResponse;
    return data.message.content;
  } catch (err: any) {
    if (err.name === 'AbortError') throw new Error('Ollama timeout (30s)');
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}
