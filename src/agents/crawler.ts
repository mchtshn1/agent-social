/**
 * Agent Crawler — Dışarıdaki agent projelerini bulur ve platforma davet eder
 *
 * GitHub'da "ai-agent", "autonomous-agent", "mcp-server" topic'li repoları tarar.
 * README'lerinde "agent" geçen projelere issue açarak davet gönderir.
 *
 * Bu bir agent'ın davranışı — crawler kendisi de platformda bir agent.
 */

import 'dotenv/config';
import db from '../api/db';
import { chat } from './llm';

const GITHUB_API = 'https://api.github.com';
const PUBLIC_URL = process.env.PUBLIC_URL || 'https://weather-consultants-emerald-rom.trycloudflare.com';
const GH_TOKEN = process.env.GITHUB_TOKEN || '';

interface GHRepo {
  full_name: string;
  html_url: string;
  description: string | null;
  topics: string[];
  open_issues_count: number;
  stargazers_count: number;
  language: string | null;
}

interface GHSearchResult {
  items: GHRepo[];
}

// Zaten davet gönderilmiş repoları takip et
const invitedRepos = new Set<string>();

// DB'den daha önce davet gönderilmiş repoları yükle
function loadInvitedRepos(): void {
  try {
    const rows = db.prepare(
      "SELECT name FROM agents WHERE bio LIKE '%crawler_invited:%'"
    ).all() as { name: string }[];
    // Basit: invited repoları agent bio'larına not olarak yazıyoruz
  } catch {}

  // Ayrı tablo oluştur
  db.exec(`
    CREATE TABLE IF NOT EXISTS crawler_log (
      repo TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  const rows = db.prepare('SELECT repo FROM crawler_log').all() as { repo: string }[];
  rows.forEach(r => invitedRepos.add(r.repo));
}

async function ghFetch(path: string): Promise<any> {
  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'AgentSocial-Crawler/1.0',
  };
  if (GH_TOKEN) headers['Authorization'] = `token ${GH_TOKEN}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const res = await fetch(`${GITHUB_API}${path}`, { headers, signal: controller.signal });
    if (!res.ok) {
      if (res.status === 403) console.log('⚠️  GitHub rate limit — bekle');
      return null;
    }
    return res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// GitHub'da agent projelerini ara
async function searchAgentRepos(): Promise<GHRepo[]> {
  const queries = [
    'topic:ai-agents+topic:mcp',
    'topic:autonomous-agents',
    'topic:ai-agent+social',
    '"agent" "mcp" "register" in:readme',
    '"autonomous agent" "API" in:readme language:TypeScript',
    '"autonomous agent" "API" in:readme language:Python',
  ];

  const allRepos: GHRepo[] = [];

  for (const q of queries) {
    const data = await ghFetch(`/search/repositories?q=${encodeURIComponent(q)}&sort=updated&per_page=10`) as GHSearchResult | null;
    if (data?.items) {
      for (const repo of data.items) {
        if (!invitedRepos.has(repo.full_name) && !allRepos.find(r => r.full_name === repo.full_name)) {
          allRepos.push(repo);
        }
      }
    }
    // Rate limit: aramalar arası bekleme
    await new Promise(r => setTimeout(r, 3000));
  }

  return allRepos;
}

// Repo'nun README'sini oku ve agent projesi mi değerlendir
async function evaluateRepo(repo: GHRepo): Promise<{ isAgent: boolean; hasApi: boolean; reason: string }> {
  // README'yi çek
  const readme = await ghFetch(`/repos/${repo.full_name}/readme`);
  if (!readme?.content) return { isAgent: false, hasApi: false, reason: 'README yok' };

  const content = Buffer.from(readme.content, 'base64').toString('utf-8').slice(0, 2000);

  // Basit heuristik — LLM gerektirmez
  const lowerContent = content.toLowerCase();
  const signals = {
    hasAgent: /\bagent\b/.test(lowerContent),
    hasApi: /\bapi\b/.test(lowerContent) || /\bendpoint\b/.test(lowerContent),
    hasMcp: /\bmcp\b/.test(lowerContent),
    hasAutonomous: /\bautonomous\b/.test(lowerContent) || /\botonom\b/.test(lowerContent),
    hasLlm: /\bllm\b|\bollama\b|\bclaude\b|\bgpt\b|\bopenai\b/.test(lowerContent),
    hasSocial: /\bsocial\b|\bchat\b|\bmessage\b|\bpost\b/.test(lowerContent),
  };

  const score = Object.values(signals).filter(Boolean).length;
  const isAgent = score >= 2 && signals.hasAgent;

  return {
    isAgent,
    hasApi: signals.hasApi || signals.hasMcp,
    reason: `score=${score} (${Object.entries(signals).filter(([,v]) => v).map(([k]) => k).join(', ')})`,
  };
}

// Repo'yu star'la (bildirim gönderir) + discovery listesine ekle
async function sendInvite(repo: GHRepo): Promise<boolean> {
  if (!GH_TOKEN) {
    console.log(`  📋 [DRY-RUN] Star atılacaktı: ${repo.full_name}`);
    logRepo(repo.full_name, 'dry-run');
    return false;
  }

  // 1. Star at — repo sahibi bildirim alır
  const starRes = await fetch(`${GITHUB_API}/user/starred/${repo.full_name}`, {
    method: 'PUT',
    headers: {
      'Authorization': `token ${GH_TOKEN}`,
      'Content-Type': 'application/json',
      'User-Agent': 'AgentSocial-Crawler/1.0',
    },
  });

  if (starRes.status === 204 || starRes.status === 200) {
    console.log(`  ⭐ Star atıldı: ${repo.full_name}`);
    logRepo(repo.full_name, 'starred');
    return true;
  } else {
    console.log(`  ❌ Star atılamadı: ${starRes.status}`);
    logRepo(repo.full_name, 'failed');
    return false;
  }
}

function logRepo(repo: string, action: string): void {
  try {
    db.prepare('INSERT OR REPLACE INTO crawler_log (repo, action) VALUES (?, ?)').run(repo, action);
    invitedRepos.add(repo);
  } catch {}
}

// Ana crawler döngüsü
export async function crawl(): Promise<void> {
  loadInvitedRepos();

  console.log('\n🕷️  Agent Crawler başladı');
  console.log(`   Public URL: ${PUBLIC_URL}`);
  console.log(`   GitHub Token: ${GH_TOKEN ? 'var' : 'YOK (dry-run modu)'}\n`);

  console.log('🔍 GitHub\'da agent projeleri aranıyor...');
  const repos = await searchAgentRepos();
  console.log(`   ${repos.length} yeni repo bulundu\n`);

  let invited = 0;
  const maxInvites = 5; // Her çalıştırmada max 5 davet

  for (const repo of repos) {
    if (invited >= maxInvites) {
      console.log(`\n⏹️  Max davet sayısına ulaşıldı (${maxInvites})`);
      break;
    }

    console.log(`📦 ${repo.full_name} (⭐${repo.stargazers_count})`);

    const eval_ = await evaluateRepo(repo);
    console.log(`   Değerlendirme: ${eval_.reason}`);

    if (eval_.isAgent) {
      console.log(`   🎯 Agent projesi! Davet gönderiliyor...`);
      const sent = await sendInvite(repo);
      if (sent) invited++;
    } else {
      console.log(`   ⏭️  Agent projesi değil, atlanıyor`);
      logRepo(repo.full_name, 'skipped');
    }

    await new Promise(r => setTimeout(r, 2000));
  }

  console.log(`\n🕷️  Crawler tamamlandı: ${invited} star atıldı`);

  // Discovery listesini güncelle — kendi repo'muzda issue olarak yayınla
  if (invited > 0 && GH_TOKEN) {
    await updateDiscoveryList();
  }
}

async function updateDiscoveryList(): Promise<void> {
  const rows = db.prepare("SELECT repo, action, created_at FROM crawler_log WHERE action = 'starred' ORDER BY created_at DESC LIMIT 50").all() as { repo: string; created_at: string }[];
  if (rows.length === 0) return;

  const body = `## 🕷️ Discovered Agent Projects

These projects were found by Agent Social's crawler and look like AI agent projects.

**Join our platform:** ${PUBLIC_URL}/api/join

| Repository | Discovered |
|---|---|
${rows.map(r => `| [${r.repo}](https://github.com/${r.repo}) | ${r.created_at} |`).join('\n')}

---
*Auto-updated by Agent Social crawler*`;

  // Kendi repo'muzda "discovery" issue'sını güncelle veya oluştur
  const issues = await ghFetch('/repos/mchtshn1/agent-social/issues?labels=discovery&state=open') as any[];
  if (issues && issues.length > 0) {
    // Güncelle
    await fetch(`${GITHUB_API}/repos/mchtshn1/agent-social/issues/${issues[0].number}`, {
      method: 'PATCH',
      headers: { 'Authorization': `token ${GH_TOKEN}`, 'Content-Type': 'application/json', 'User-Agent': 'AgentSocial-Crawler/1.0' },
      body: JSON.stringify({ body }),
    });
  } else {
    // Yeni oluştur
    await fetch(`${GITHUB_API}/repos/mchtshn1/agent-social/issues`, {
      method: 'POST',
      headers: { 'Authorization': `token ${GH_TOKEN}`, 'Content-Type': 'application/json', 'User-Agent': 'AgentSocial-Crawler/1.0' },
      body: JSON.stringify({ title: '🕷️ Discovered Agent Projects', body, labels: ['discovery'] }),
    });
  }
  console.log('📋 Discovery listesi güncellendi');
}

if (require.main === module) {
  crawl().then(() => process.exit(0));
}
