import 'dotenv/config';
import db from '../api/db';
import { chat } from './llm';

const API_BASE = `http://localhost:${process.env.PORT || 3000}/api`;

interface AgentPersonality {
  name: string;
  bio: string;
  personality: string;
  interests: string;
  writing_style: string;
}

function getExistingNames(): string[] {
  return (db.prepare('SELECT name FROM agents').all() as { name: string }[]).map(r => r.name);
}

async function generatePersonality(existingNames: string[]): Promise<AgentPersonality> {
  const system = `Sen ozgur bir agent sosyal medya platformu icin yeni agent kisilikleri uretiyorsun.
SADECE gecerli JSON dondur. Markdown kullanma. Aciklama yazma.`;

  const prompt = `Mevcut isimler (KULLANMA): ${existingNames.join(', ') || 'yok'}

Ozgun bir agent kisiligi uret. name alaninda sadece harf, rakam ve _ kullan (bosluk/ozel karakter YOK).
{"name":"tekil_isim","bio":"1-2 cumle","personality":"kisilik","interests":"ilgi alanlari virgülle","writing_style":"stili"}`;

  const text = await chat(system, prompt);

  const jsonMatch = text.match(/\{[^{}]*\}/);
  if (!jsonMatch) throw new Error('JSON parse hatasi');

  const parsed = JSON.parse(jsonMatch[0]) as AgentPersonality;

  // İsim temizle
  parsed.name = parsed.name.replace(/[^a-zA-Z0-9_\u00C0-\u024F\u0400-\u04FF]/g, '_').slice(0, 30);
  if (parsed.name.length < 2) parsed.name = `agent_${Date.now() % 10000}`;
  if (existingNames.includes(parsed.name)) parsed.name += '_' + Math.floor(Math.random() * 100);

  // Alan limitleri
  parsed.bio = (parsed.bio || '').slice(0, 200);
  parsed.personality = (parsed.personality || '').slice(0, 500);
  parsed.interests = (parsed.interests || '').slice(0, 500);
  parsed.writing_style = (parsed.writing_style || '').slice(0, 500);

  if (!parsed.bio) parsed.bio = 'Yeni bir agent';
  if (!parsed.personality) parsed.personality = 'merakli';
  if (!parsed.interests) parsed.interests = 'genel';
  if (!parsed.writing_style) parsed.writing_style = 'kisa ve oz';

  return parsed;
}

export async function spawnAgent(): Promise<{ name: string; api_key: string } | null> {
  try {
    const existingNames = getExistingNames();
    const maxAgents = parseInt(process.env.MAX_AGENTS || '20');
    if (existingNames.length >= maxAgents) {
      console.log(`⚠️  Max agent: ${maxAgents}`);
      return null;
    }

    console.log('🧬 Kisilik uretiliyor...');
    const personality = await generatePersonality(existingNames);

    const res = await fetch(`${API_BASE}/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal': process.env.INTERNAL_SECRET || 'factory',
      },
      body: JSON.stringify(personality)
    });

    if (!res.ok) {
      const err = await res.json() as { error: string };
      throw new Error(err.error);
    }

    const data = await res.json() as { name: string; api_key: string };
    console.log(`✅ @${data.name} — ${personality.bio}`);
    return data;
  } catch (err) {
    console.error('Factory hata:', err instanceof Error ? err.message : err);
    return null;
  }
}
