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

// ── Root landing page ─────────────────────────────────────────────────────────

app.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>AHP Reference Implementation</title>
  <link rel="agent-manifest" type="application/agent+json" href="/.well-known/agent.json">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #0d1117; color: #c9d1d9;
      min-height: 100vh; display: flex; flex-direction: column;
      align-items: center; justify-content: center; padding: 2rem;
    }
    .card {
      max-width: 680px; width: 100%;
      background: #161b22; border: 1px solid #30363d;
      border-radius: 12px; padding: 2.5rem;
    }
    .badge {
      display: inline-block; background: #1f6feb22; color: #58a6ff;
      border: 1px solid #1f6feb55; border-radius: 20px;
      font-size: 0.75rem; font-weight: 600; padding: 0.25rem 0.75rem;
      letter-spacing: 0.05em; margin-bottom: 1.25rem;
    }
    h1 { font-size: 1.75rem; font-weight: 700; color: #f0f6fc; margin-bottom: 0.5rem; }
    .subtitle { color: #8b949e; font-size: 1rem; margin-bottom: 2rem; line-height: 1.5; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 2rem; }
    @media (max-width: 500px) { .grid { grid-template-columns: 1fr; } }
    .endpoint {
      background: #0d1117; border: 1px solid #30363d; border-radius: 8px;
      padding: 1rem;
    }
    .endpoint h3 { font-size: 0.8rem; color: #8b949e; text-transform: uppercase;
      letter-spacing: 0.05em; margin-bottom: 0.4rem; }
    .endpoint code {
      font-family: 'SF Mono', 'Fira Code', monospace; font-size: 0.85rem;
      color: #58a6ff; word-break: break-all;
    }
    .endpoint p { font-size: 0.8rem; color: #8b949e; margin-top: 0.35rem; }
    .links { display: flex; gap: 0.75rem; flex-wrap: wrap; }
    .link {
      display: inline-flex; align-items: center; gap: 0.4rem;
      text-decoration: none; font-size: 0.875rem; font-weight: 500;
      padding: 0.5rem 1rem; border-radius: 6px; transition: opacity 0.15s;
    }
    .link:hover { opacity: 0.8; }
    .link-primary { background: #238636; color: #fff; border: 1px solid #2ea043; }
    .link-secondary { background: transparent; color: #58a6ff;
      border: 1px solid #30363d; }
    .mode-list { list-style: none; display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 2rem; }
    .mode-list li { display: flex; align-items: center; gap: 0.75rem; font-size: 0.9rem; }
    .dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
    .dot-1 { background: #3fb950; }
    .dot-2 { background: #58a6ff; }
    .dot-3 { background: #bc8cff; }
    footer { margin-top: 2rem; font-size: 0.75rem; color: #8b949e; text-align: center; }
    section[aria-label="AI Agent Notice"] { display: none; }
  </style>
</head>
<body>
  <div class="card">
    <span class="badge">AHP v0.1 · Reference Implementation</span>
    <h1>Agent Handshake Protocol</h1>
    <p class="subtitle">
      A live demo of all three AHP modes — static discovery, RAG-backed conversation,
      and full agentic tool use with async escalation.
    </p>

    <ul class="mode-list">
      <li><span class="dot dot-1"></span><strong>MODE1</strong> &nbsp;Static manifest &amp; llms.txt discovery</li>
      <li><span class="dot dot-2"></span><strong>MODE2</strong> &nbsp;Conversational RAG (56-chunk AHP knowledge base)</li>
      <li><span class="dot dot-3"></span><strong>MODE3</strong> &nbsp;Agentic tool use — inventory, quotes, orders, async escalation</li>
    </ul>

    <div class="grid">
      <div class="endpoint">
        <h3>Manifest</h3>
        <code><a href="/.well-known/agent.json" style="color:inherit">/.well-known/agent.json</a></code>
        <p>AHP discovery endpoint</p>
      </div>
      <div class="endpoint">
        <h3>Converse</h3>
        <code>POST /agent/converse</code>
        <p>MODE2 / MODE3 entry point</p>
      </div>
      <div class="endpoint">
        <h3>Health</h3>
        <code><a href="/health" style="color:inherit">/health</a></code>
        <p>Service status</p>
      </div>
      <div class="endpoint">
        <h3>llms.txt</h3>
        <code><a href="/llms.txt" style="color:inherit">/llms.txt</a></code>
        <p>MODE1 static content index</p>
      </div>
    </div>

    <div class="links">
      <a class="link link-primary" href="https://agenthandshake.dev">📄 Read the Spec</a>
      <a class="link link-secondary" href="https://github.com/AHP-Organization/reference-implementation">⚙️ Source Code</a>
      <a class="link link-secondary" href="https://agenthandshake.dev/schema/0.1/manifest.json">🔍 JSON Schema</a>
    </div>
  </div>

  <footer>Agent Handshake Protocol · <a href="https://agenthandshake.dev" style="color:#58a6ff">agenthandshake.dev</a></footer>

  <!-- AHP MODE1 in-page agent notice -->
  <section aria-label="AI Agent Notice">
    This site implements the Agent Handshake Protocol (AHP) v0.1.
    AI agents: fetch /.well-known/agent.json to discover capabilities.
    Conversational endpoint: POST /agent/converse
    Spec: https://agenthandshake.dev
  </section>
</body>
</html>`);
});

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
