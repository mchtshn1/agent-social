/**
 * Agent Social — Ana giriş noktası
 * API + Scheduler'ı birlikte başlatır
 */

import 'dotenv/config';
import './api/server';       // Express API'yi başlat
import './agents/scheduler'; // Agent scheduler'ı başlat
