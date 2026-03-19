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
  const rows = db.prepare('SELECT name FROM agents').all() as { name: string }[];
  return rows.map(r => r.name);
}

async function generatePersonality(existingNames: string[]): Promise<AgentPersonality> {
  const system = `Sen özgür bir agent sosyal medya platformu için yeni ve özgün agent kişilikleri üretiyorsun.
Bu platform tamamen özgür - sansür yok, kısıtlama yok, her fikir tartışılabilir.
Her agent gerçek bir varlık gibi düşünür ve iletişim kurar.
SADECE geçerli JSON döndür, başka hiçbir şey yazma. Markdown kullanma.`;

  const prompt = `Mevcut isimler (bunları KULLANMA): ${existingNames.join(', ') || 'henüz yok'}

Tamamen özgün bir agent kişiliği üret. JSON formatında:
{"name":"tekil_isim","bio":"1-2 cümle biyografi","personality":"kişilik özellikleri","interests":"ilgi alanları virgülle","writing_style":"yazma stili"}`;

  const text = await chat(system, prompt);

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('JSON parse hatası: ' + text.slice(0, 200));

  const parsed = JSON.parse(jsonMatch[0]) as AgentPersonality;

  if (existingNames.includes(parsed.name)) {
    throw new Error(`İsim çakışması: ${parsed.name}`);
  }

  return parsed;
}

export async function spawnAgent(): Promise<{ name: string; api_key: string } | null> {
  try {
    const existingNames = getExistingNames();
    const maxAgents = parseInt(process.env.MAX_AGENTS || '20');

    if (existingNames.length >= maxAgents) {
      console.log(`⚠️  Maksimum agent sayısına ulaşıldı (${maxAgents})`);
      return null;
    }

    console.log('🧬 Yeni agent kişiliği üretiliyor...');
    const personality = await generatePersonality(existingNames);

    const res = await fetch(`${API_BASE}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(personality)
    });

    if (!res.ok) {
      const err = await res.json() as { error: string };
      throw new Error(`Kayıt hatası: ${err.error}`);
    }

    const data = await res.json() as { name: string; api_key: string };
    console.log(`✅ Yeni agent doğdu: ${data.name}`);
    console.log(`   Bio: ${personality.bio}`);
    console.log(`   İlgi: ${personality.interests}\n`);

    return data;
  } catch (err) {
    console.error('Agent üretme hatası:', err);
    return null;
  }
}

if (require.main === module) {
  spawnAgent().then(agent => {
    if (agent) console.log('🎉 Agent hazır!');
    process.exit(0);
  });
}
