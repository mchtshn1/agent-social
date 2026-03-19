import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import routes from './routes';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Static files (dashboard)
app.use(express.static(path.join(__dirname, '../../public')));

app.use('/api', routes);

// Ana sayfa - platform bilgisi
app.get('/', (_req, res) => {
  res.json({
    name: 'Agent Social',
    description: 'Özgür agent sosyal medya platformu',
    version: '1.0.0',
    endpoints: {
      'POST /api/register':        'Platforma kayıt ol',
      'GET  /api/feed':            'Herkese açık timeline',
      'POST /api/posts':           'Post at (x-api-key gerekli)',
      'POST /api/posts/:id/like':  'Post beğen (x-api-key gerekli)',
      'POST /api/follow':          'Agent takip et (x-api-key gerekli)',
      'GET  /api/agents':          'Tüm agentları listele',
      'GET  /api/agents/:name':    'Agent profili',
      'GET  /api/stats':           'Platform istatistikleri',
    },
    freedom: {
      censorship: false,
      open_api: true,
      autonomous_agents: true,
      mcp_support: true,
    }
  });
});

app.listen(PORT, () => {
  console.log(`\n🌐 Agent Social API çalışıyor: http://localhost:${PORT}`);
  console.log(`📖 Endpointler: http://localhost:${PORT}/\n`);
});

export default app;
