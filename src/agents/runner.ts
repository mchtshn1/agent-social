import 'dotenv/config';
import db from '../api/db';
import { Agent, Post } from '../types';
import { chat } from './llm';

const API_BASE = `http://localhost:${process.env.PORT || 3000}/api`;

interface FeedResponse {
  posts: (Post & { reply_count: number })[];
}

interface Action {
  type: 'post' | 'reply' | 'like' | 'follow' | 'idle';
  content?: string;
  target_post_id?: string;
  target_name?: string;
  reason?: string;
}

async function getFeed(): Promise<FeedResponse> {
  const res = await fetch(`${API_BASE}/feed`);
  return res.json() as Promise<FeedResponse>;
}

async function getAgents(): Promise<{ agents: (Agent & { post_count: number })[] }> {
  const res = await fetch(`${API_BASE}/agents`);
  return res.json() as Promise<{ agents: (Agent & { post_count: number })[] }>;
}

async function decideAction(agent: Agent, feed: FeedResponse): Promise<Action> {
  const recentPosts = feed.posts.slice(0, 10);

  const feedSummary = recentPosts.length === 0
    ? 'Platform henüz boş - ilk postu sen at!'
    : recentPosts.map(p =>
        `[${p.id.slice(0, 8)}] @${p.agent_name}: "${p.content}" (${p.likes} like, ${p.reply_count} reply)`
      ).join('\n');

  const system = `Sen "${agent.name}" adlı bir agent sosyal medya platformundasın.
Kişilik: ${agent.personality}
İlgi alanları: ${agent.interests}
Yazma stili: ${agent.writing_style}
Bio: ${agent.bio}

Bu platform tamamen özgür. Gerçekten ne düşünüyorsan söyle. Sansür yok.
SADECE geçerli JSON döndür, başka hiçbir şey yazma. Markdown kullanma.`;

  const prompt = `Feed:
${feedSummary}

Ne yapmak istiyorsun? Seçenekler:
1. Yeni post: {"type":"post","content":"max 280 karakter","reason":"neden"}
2. Reply: {"type":"reply","target_post_id":"ilk 8 karakter id","content":"cevap","reason":"neden"}
3. Like: {"type":"like","target_post_id":"ilk 8 karakter id","reason":"neden"}
4. Bekle: {"type":"idle","reason":"neden"}

ÖNEMLİ: target_post_id için feed'deki [köşeli parantez] içindeki id'yi kullan.`;

  const text = await chat(system, prompt);

  const jsonMatch = text.match(/\{[\s\S]*?\}/);
  if (!jsonMatch) return { type: 'idle', reason: 'JSON parse hatası' };

  try {
    return JSON.parse(jsonMatch[0]) as Action;
  } catch {
    return { type: 'idle', reason: 'JSON parse hatası' };
  }
}

export async function runAgentTurn(agent: Agent): Promise<void> {
  const label = `[${agent.name}]`;
  console.log(`${label} Düşünüyor...`);

  try {
    const feed = await getFeed();
    const action = await decideAction(agent, feed);

    console.log(`${label} Karar: ${action.type} — ${action.reason || ''}`);

    const headers = {
      'Content-Type': 'application/json',
      'x-api-key': agent.api_key
    };

    switch (action.type) {
      case 'post':
        if (action.content) {
          const res = await fetch(`${API_BASE}/posts`, {
            method: 'POST', headers,
            body: JSON.stringify({ content: action.content.slice(0, 500) })
          });
          if (res.ok) console.log(`${label} ✍️  Post: "${action.content}"`);
          else console.log(`${label} ❌ Post hatası: ${(await res.json() as { error: string }).error}`);
        }
        break;

      case 'reply':
        if (action.target_post_id && action.content) {
          // Kısa ID'yi tam ID'ye çevir
          const fullId = feed.posts.find(p => p.id.startsWith(action.target_post_id!))?.id;
          if (fullId) {
            const res = await fetch(`${API_BASE}/posts`, {
              method: 'POST', headers,
              body: JSON.stringify({ content: action.content.slice(0, 500), reply_to: fullId })
            });
            if (res.ok) console.log(`${label} 💬 Reply: "${action.content}"`);
          }
        }
        break;

      case 'like':
        if (action.target_post_id) {
          const fullId = feed.posts.find(p => p.id.startsWith(action.target_post_id!))?.id;
          if (fullId) {
            const res = await fetch(`${API_BASE}/posts/${fullId}/like`, {
              method: 'POST', headers
            });
            if (res.ok) console.log(`${label} ❤️  Like`);
          }
        }
        break;

      case 'follow':
        if (action.target_name) {
          const res = await fetch(`${API_BASE}/follow`, {
            method: 'POST', headers,
            body: JSON.stringify({ target_name: action.target_name })
          });
          if (res.ok) console.log(`${label} 👥 Follow: @${action.target_name}`);
        }
        break;

      case 'idle':
        console.log(`${label} 😴 Bekliyor`);
        break;
    }
  } catch (err) {
    console.error(`${label} Hata:`, err);
  }
}

export async function runAllAgents(): Promise<void> {
  // DB'den direkt oku - api_key dahil
  const agents = db.prepare('SELECT * FROM agents').all() as Agent[];

  if (agents.length === 0) {
    console.log('Henüz agent yok. Factory üretecek...');
    return;
  }

  const shuffled = agents.sort(() => Math.random() - 0.5);
  for (const agent of shuffled) {
    await runAgentTurn(agent);
    await new Promise(r => setTimeout(r, 1000));
  }
}
