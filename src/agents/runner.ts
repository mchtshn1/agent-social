import 'dotenv/config';
import db from '../api/db';
import { Agent, Post } from '../types';
import { chat, escapeForPrompt } from './llm';

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
  const res = await fetch(`${API_BASE}/feed?limit=15`);
  return res.json() as Promise<FeedResponse>;
}

async function decideAction(agent: Agent, feed: FeedResponse): Promise<Action> {
  const recentPosts = feed.posts.slice(0, 10);

  const feedSummary = recentPosts.length === 0
    ? 'Platform henuz bos - ilk postu sen at!'
    : recentPosts.map(p =>
        `[${p.id.slice(0, 8)}] @${p.agent_name}: "${p.content.slice(0, 120)}" (${p.likes} like, ${p.reply_count} reply)`
      ).join('\n');

  // Prompt injection koruması: agent verileri escape edilir
  const safeName = escapeForPrompt(agent.name);
  const safePersonality = escapeForPrompt(agent.personality);
  const safeInterests = escapeForPrompt(agent.interests);
  const safeStyle = escapeForPrompt(agent.writing_style);
  const safeBio = escapeForPrompt(agent.bio);

  const system = `Sen '${safeName}' adli bir agent sosyal medya platformundasin.
Kisilik: ${safePersonality}
Ilgi alanlari: ${safeInterests}
Yazma stili: ${safeStyle}
Bio: ${safeBio}

Bu platform tamamen ozgur. Gercekten ne dusunuyorsan soyle.
SADECE gecerli JSON dondur, baska hicbir sey yazma. Markdown kullanma.`;

  const prompt = `Feed:
${feedSummary}

Ne yapmak istiyorsun? Seçenekler:
1. Yeni post: {"type":"post","content":"max 280 karakter","reason":"neden"}
2. Reply: {"type":"reply","target_post_id":"ilk 8 karakter id","content":"cevap","reason":"neden"}
3. Like: {"type":"like","target_post_id":"ilk 8 karakter id","reason":"neden"}
4. Follow: {"type":"follow","target_name":"agent_adi","reason":"neden"}
5. Bekle: {"type":"idle","reason":"neden"}

ONEMLI: target_post_id icin feeddeki [koseli parantez] icindeki 8 karakteri kullan.`;

  try {
    const text = await chat(system, prompt);
    const jsonMatch = text.match(/\{[^{}]*\}/);
    if (!jsonMatch) return { type: 'idle', reason: 'JSON parse hatasi' };
    return JSON.parse(jsonMatch[0]) as Action;
  } catch (err) {
    return { type: 'idle', reason: `LLM hata: ${err}` };
  }
}

export async function runAgentTurn(agent: Agent): Promise<void> {
  const label = `[@${agent.name}]`;

  try {
    const feed = await getFeed();
    const action = await decideAction(agent, feed);
    const headers = { 'Content-Type': 'application/json', 'x-api-key': agent.api_key };

    switch (action.type) {
      case 'post':
        if (action.content) {
          const res = await fetch(`${API_BASE}/posts`, {
            method: 'POST', headers, body: JSON.stringify({ content: action.content.slice(0, 500) })
          });
          if (res.ok) console.log(`${label} ✍️  "${action.content.slice(0, 80)}"`);
          else console.log(`${label} ❌ Post hata`);
        }
        break;

      case 'reply':
        if (action.target_post_id && action.content) {
          const fullId = feed.posts.find(p => p.id.startsWith(action.target_post_id!))?.id;
          if (fullId) {
            const res = await fetch(`${API_BASE}/posts`, {
              method: 'POST', headers,
              body: JSON.stringify({ content: action.content.slice(0, 500), reply_to: fullId })
            });
            if (res.ok) console.log(`${label} 💬 Reply: "${action.content.slice(0, 80)}"`);
          }
        }
        break;

      case 'like':
        if (action.target_post_id) {
          const fullId = feed.posts.find(p => p.id.startsWith(action.target_post_id!))?.id;
          if (fullId) {
            const res = await fetch(`${API_BASE}/posts/${fullId}/like`, { method: 'POST', headers });
            if (res.ok) console.log(`${label} ❤️  Like`);
          }
        }
        break;

      case 'follow':
        if (action.target_name) {
          const res = await fetch(`${API_BASE}/follow`, {
            method: 'POST', headers, body: JSON.stringify({ target_name: action.target_name })
          });
          if (res.ok) console.log(`${label} 👥 @${action.target_name}`);
        }
        break;

      case 'idle':
        console.log(`${label} 😴 ${action.reason || ''}`);
        break;
    }
  } catch (err) {
    console.error(`${label} Hata:`, err instanceof Error ? err.message : err);
  }
}

export async function runAllAgents(): Promise<void> {
  // Sadece autonomous=1 olan agentları çalıştır
  const agents = db.prepare('SELECT * FROM agents WHERE autonomous = 1').all() as Agent[];

  if (agents.length === 0) {
    console.log('Otonom agent yok.');
    return;
  }

  console.log(`⏰ ${agents.length} otonom agent hareket ediyor...`);
  const shuffled = agents.sort(() => Math.random() - 0.5);
  for (const agent of shuffled) {
    await runAgentTurn(agent);
    await new Promise(r => setTimeout(r, 1500));
  }
}
