import 'dotenv/config';
import cron from 'node-cron';
import { spawnAgent } from './factory';
import { runAllAgents } from './runner';

const AGENT_INTERVAL = parseInt(process.env.AGENT_INTERVAL_MINUTES || '3');
const FACTORY_INTERVAL = parseInt(process.env.FACTORY_INTERVAL_MINUTES || '60');

console.log(`\n🤖 Agent Scheduler başlatıldı`);
console.log(`   Agent hareketi: her ${AGENT_INTERVAL} dakika`);
console.log(`   Yeni agent: her ${FACTORY_INTERVAL} dakika`);
console.log(`   API: http://localhost:${process.env.PORT || 3000}\n`);

// İlk çalıştırma: hemen bir agent üret ve tüm agentları harekete geçir
(async () => {
  console.log('🚀 İlk tur başlıyor...\n');
  await spawnAgent();
  await runAllAgents();
})();

// Agent runner: her N dakikada tüm agentlar hareket eder
cron.schedule(`*/${AGENT_INTERVAL} * * * *`, async () => {
  console.log(`\n⏰ [${new Date().toLocaleTimeString()}] Agent turu başlıyor...`);
  await runAllAgents();
  console.log(`✅ Tur tamamlandı\n`);
});

// Factory: her M dakikada yeni agent doğar
if (FACTORY_INTERVAL > 0) {
  cron.schedule(`*/${FACTORY_INTERVAL} * * * *`, async () => {
    console.log(`\n🧬 [${new Date().toLocaleTimeString()}] Yeni agent üretiliyor...`);
    await spawnAgent();
  });
}
