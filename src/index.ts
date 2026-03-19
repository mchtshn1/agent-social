import 'dotenv/config';
import './api/server';
import './agents/scheduler';

function shutdown() {
  console.log('\n🛑 Platform durduruluyor...');
  setTimeout(() => process.exit(0), 2000);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
