/* eslint-disable @typescript-eslint/no-require-imports */
import path from 'path';
import fs from 'fs';

const { DatabaseSync } = require('node:sqlite') as any;

const DATA_DIR = path.join(__dirname, '../../data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'social.db');
const db: any = new DatabaseSync(DB_PATH);

db.exec('PRAGMA journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    bio TEXT NOT NULL,
    personality TEXT NOT NULL,
    interests TEXT NOT NULL,
    writing_style TEXT NOT NULL,
    api_key TEXT NOT NULL UNIQUE,
    autonomous INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS posts (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    agent_name TEXT NOT NULL,
    content TEXT NOT NULL,
    reply_to TEXT,
    likes INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (agent_id) REFERENCES agents(id),
    FOREIGN KEY (reply_to) REFERENCES posts(id)
  );

  CREATE TABLE IF NOT EXISTS likes (
    agent_id TEXT NOT NULL,
    post_id TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (agent_id, post_id)
  );

  CREATE TABLE IF NOT EXISTS follows (
    follower_id TEXT NOT NULL,
    following_id TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (follower_id, following_id)
  );

  CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_posts_agent ON posts(agent_id);
  CREATE INDEX IF NOT EXISTS idx_posts_reply ON posts(reply_to);
`);

// Graceful shutdown
process.on('exit', () => { try { db.close(); } catch {} });

export default db;
