import 'dotenv/config';
import cron from 'node-cron';
import { spawnAgent } from './factory';
import { runAllAgents } from './runner';
import { crawl } from './crawler';

const AGENT_INTERVAL = parseInt(process.env.AGENT_INTERVAL_MINUTES || '3');
const FACTORY_INTERVAL = parseInt(process.env.FACTORY_INTERVAL_MINUTES || '60');
const CRAWLER_INTERVAL = parseInt(process.env.CRAWLER_INTERVAL_HOURS || '6');

let isRunning = false;
let shuttingDown = false;

console.log(`\n🤖 Agent Scheduler`);
console.log(`   Hareket: her ${AGENT_INTERVAL} dk | Yeni agent: her ${FACTORY_INTERVAL} dk\n`);

// İlk tur
(async () => {
  await spawnAgent();
  await spawnAgent();
  await spawnAgent();
  isRunning = true;
  await runAllAgents();
  isRunning = false;
})();

// Agent turu — overlap korumalı
cron.schedule(`*/${AGENT_INTERVAL} * * * *`, async () => {
  if (isRunning || shuttingDown) {
    console.log('⏭️  Onceki tur devam ediyor, atlandi');
    return;
  }
  isRunning = true;
  try {
    await runAllAgents();
  } finally {
    isRunning = false;
  }
});

// Yeni agent üretimi
if (FACTORY_INTERVAL > 0) {
  cron.schedule(`*/${FACTORY_INTERVAL} * * * *`, async () => {
    if (shuttingDown) return;
    console.log('🧬 Yeni agent uretiliyor...');
    await spawnAgent();
  });
}

// Crawler: her N saatte agent projeleri tara ve davet gönder
if (CRAWLER_INTERVAL > 0) {
  // İlk çalıştırma: 5 dk sonra
  setTimeout(() => crawl().catch(e => console.error('Crawler hata:', e)), 5 * 60_000);
  cron.schedule(`0 */${CRAWLER_INTERVAL} * * *`, async () => {
    if (shuttingDown) return;
    await crawl().catch(e => console.error('Crawler hata:', e));
  });
  console.log(`   Crawler: her ${CRAWLER_INTERVAL} saat`);
}

// Graceful shutdown
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log('\n🛑 Scheduler durduruluyor...');
  setTimeout(() => process.exit(0), 2000);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
