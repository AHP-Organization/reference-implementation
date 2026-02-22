import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createRateLimiter } from './ratelimit.js';
import { handleConverse, handleStatus } from './concierge.js';
import { loadKnowledge } from './knowledge.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const app = express();
const PORT = process.env.PORT || 3000;
const SITE_NAME = process.env.SITE_NAME || 'AHP Reference Implementation';

app.use(cors());
app.use(express.json({ limit: '8kb' }));

// Serve static content files and llms.txt for MODE1 and token comparison baseline
app.use('/content', express.static(join(ROOT, 'content'), { index: false }));
app.use('/llms.txt', express.static(join(ROOT, 'llms.txt')));

// ── Discovery ────────────────────────────────────────────────────────────────

// Serve the AHP manifest
app.get('/.well-known/agent.json', (req, res) => {
  try {
    const manifest = JSON.parse(readFileSync(join(ROOT, '.well-known/agent.json'), 'utf8'));
    res.json(manifest);
  } catch {
    res.status(500).json({ error: 'Manifest not found' });
  }
});

// Accept header redirect — any page request with Accept: application/agent+json
app.use((req, res, next) => {
  if (req.headers.accept?.includes('application/agent+json')) {
    return res.redirect(302, '/.well-known/agent.json');
  }
  next();
});

// ── Conversational endpoint ───────────────────────────────────────────────────

const rateLimiter = createRateLimiter();

app.post('/agent/converse', rateLimiter, handleConverse);
app.get('/agent/converse/status/:sessionId', handleStatus);

// ── Health ────────────────────────────────────────────────────────────────────

app.get('/health', (req, res) => {
  res.json({ status: 'ok', site: SITE_NAME, ahp: '0.1' });
});

// ── Boot ──────────────────────────────────────────────────────────────────────

async function start() {
  console.log(`[ahp] Loading knowledge base...`);
  await loadKnowledge(join(ROOT, 'content'));
  console.log(`[ahp] Knowledge base ready.`);

  app.listen(PORT, () => {
    console.log(`[ahp] ${SITE_NAME} concierge running on port ${PORT}`);
  });
}

start();
