import Anthropic from '@anthropic-ai/sdk';
import NodeCache from 'node-cache';
import { retrieve, getAll, getStats } from './knowledge.js';
import { createSession, getSession, touchSession, appendHistory, isExhausted } from './sessions.js';
import { handleMode3Query, handleMode3Async } from './mode3.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const cache = new NodeCache({ stdTTL: parseInt(process.env.CACHE_TTL_SECONDS || '300') });

// Load manifest for capability list and content signals
function loadManifest() {
  try {
    return JSON.parse(readFileSync(join(ROOT, '.well-known/agent.json'), 'utf8'));
  } catch {
    return null;
  }
}

const MANIFEST = loadManifest();
const SITE_NAME = process.env.SITE_NAME || 'this site';
const SITE_DESCRIPTION = process.env.SITE_DESCRIPTION || 'a website';

// ── Capability routing ────────────────────────────────────────────────────────

const CAPABILITY_HANDLERS = {
  // MODE2
  site_info: handleSiteInfo,
  content_search: handleContentSearch,
  contact: handleContact,
  // MODE3 — sync (tool use)
  inventory_check: (args) => handleMode3Query({ capability: 'inventory_check', ...args }),
  get_quote: (args) => handleMode3Query({ capability: 'get_quote', ...args }),
  order_lookup: (args) => handleMode3Query({ capability: 'order_lookup', ...args }),
  // MODE3 — async (human escalation)
  human_escalation: handleHumanEscalation,
};

// ── Main handler ──────────────────────────────────────────────────────────────

export async function handleConverse(req, res) {
  const { ahp, capability, query, session_id, clarification, context = {} } = req.body;

  // Validate required fields
  if (!capability) return res.status(400).json(err('missing_field', 'capability is required.'));
  if (!query) return res.status(400).json(err('missing_field', 'query is required.'));

  // Validate capability
  const validCapabilities = MANIFEST?.capabilities?.map(c => c.name) || Object.keys(CAPABILITY_HANDLERS);
  if (!validCapabilities.includes(capability) && !CAPABILITY_HANDLERS[capability]) {
    return res.status(400).json({
      status: 'error',
      code: 'unknown_capability',
      message: `Unknown capability '${capability}'.`,
      available_capabilities: validCapabilities,
    });
  }

  // Session management
  let sessionId = session_id;
  if (!sessionId) {
    sessionId = createSession();
  } else {
    const session = getSession(sessionId);
    if (!session) return res.status(400).json(err('invalid_request', 'Session not found or expired.'));
    if (session.status === 'expired') return res.status(400).json(err('invalid_request', 'Session has expired.'));
    if (isExhausted(sessionId)) return res.status(400).json(err('invalid_request', 'Session turn limit reached. Start a new session.'));
  }

  touchSession(sessionId);
  appendHistory(sessionId, 'user', query);

  // Route to capability handler
  const handler = CAPABILITY_HANDLERS[capability];
  if (!handler) {
    return res.status(400).json({
      status: 'error',
      code: 'unknown_capability',
      message: `Capability '${capability}' is not implemented on this server.`,
      available_capabilities: validCapabilities,
    });
  }

  try {
    const startMs = Date.now();
    const result = await handler({ query, clarification, context, sessionId });
    const latencyMs = Date.now() - startMs;

    // MODE3 async returns an 'accepted' envelope directly
    if (result.status === 'accepted') {
      return res.json(result);
    }

    const mode = ['inventory_check', 'get_quote', 'order_lookup', 'human_escalation'].includes(capability)
      ? 'MODE3' : 'MODE2';

    // Destructure internal fields out so we don't mutate the cached object
    const {
      _tokens, _cached, _tools_used, _tool_call_count, _latency_ms,
      ...cleanResult
    } = result;

    const response = {
      status: 'success',
      session_id: sessionId,
      response: cleanResult,
      meta: {
        tokens_used: _tokens || 0,
        capability_used: capability,
        mode,
        cached: _cached || false,
        latency_ms: latencyMs,
        tools_used: _tools_used || [],
        tool_call_count: _tool_call_count || 0,
        content_signals: MANIFEST?.content_signals || {},
      },
    };

    appendHistory(sessionId, 'assistant', result.answer || '');
    res.json(response);
  } catch (e) {
    console.error(`[concierge] Error in ${capability}:`, e.message);
    res.status(500).json(err('concierge_error', 'An error occurred generating the response.'));
  }
}

export async function handleStatus(req, res) {
  const { sessionId } = req.params;
  const session = getSession(sessionId);
  if (!session) return res.status(404).json(err('invalid_request', 'Session not found.'));

  res.json({
    status: session.status,
    session_id: sessionId,
    ...(session.pendingResponse ? { response: session.pendingResponse } : {}),
  });
}

// ── Capability implementations ────────────────────────────────────────────────

async function handleSiteInfo({ query, context, sessionId }) {
  const cacheKey = `site_info:${normalizeQuery(query)}`;
  const cached = cache.get(cacheKey);
  if (cached) return { ...cached, _cached: true };

  const docs = getAll().slice(0, 3); // Top 3 docs for context
  const context_text = docs.map(d => `# ${d.title}\n${d.content.slice(0, 1000)}`).join('\n\n---\n\n');

  const { answer, tokens } = await askClaude({
    system: siteSystemPrompt(),
    context: context_text,
    query,
    maxTokens: Math.min(context.max_tokens || 500, 1000),
    sessionId,
  });

  const result = {
    content_type: 'text/answer',
    answer,
    sources: docs.map(d => ({ title: d.title, url: d.url, relevance: 'background' })),
    _tokens: tokens,
  };

  cache.set(cacheKey, result);
  return result;
}

async function handleContentSearch({ query, clarification, context, sessionId }) {
  const effectiveQuery = clarification ? `${query} (clarification: ${clarification})` : query;
  const cacheKey = `search:${normalizeQuery(effectiveQuery)}`;
  const cached = cache.get(cacheKey);
  if (cached) return { ...cached, _cached: true };

  const docs = retrieve(effectiveQuery, 5);

  if (docs.length === 0) {
    return {
      content_type: 'text/answer',
      answer: `No content found matching that query on ${SITE_NAME}.`,
      sources: [],
      _tokens: 0,
    };
  }

  const context_text = docs.map(d => `# ${d.title}\nURL: ${d.url}\n\n${d.content.slice(0, 1500)}`).join('\n\n---\n\n');

  const { answer, tokens } = await askClaude({
    system: siteSystemPrompt(),
    context: context_text,
    query: effectiveQuery,
    maxTokens: Math.min(context.max_tokens || 600, 1500),
    sessionId,
  });

  const result = {
    content_type: 'text/answer',
    answer,
    sources: docs.map(d => ({ title: d.title, url: d.url, relevance: 'direct' })),
    follow_up: {
      suggested_queries: generateSuggestedQueries(query),
    },
    _tokens: tokens,
  };

  cache.set(cacheKey, result);
  return result;
}

async function handleContact({ context }) {
  // Contact data is static — no LLM needed
  const contact = JSON.parse(
    readFileSync(join(ROOT, 'content/contact.json'), 'utf8').catch?.() ||
    '{"note":"No contact information configured."}'
  );

  return {
    content_type: 'application/data',
    payload: {
      schema: 'ahp/contact/v1',
      data: contact,
    },
    answer: `Contact information for ${SITE_NAME}: ${JSON.stringify(contact)}`,
    _tokens: 0,
  };
}

async function handleHumanEscalation({ query, context, sessionId }) {
  return handleMode3Async({ capability: 'human_escalation', query, context, sessionId });
}

// ── Claude integration ────────────────────────────────────────────────────────

async function askClaude({ system, context, query, maxTokens = 500, sessionId }) {
  const currentTurn = `Here is the relevant site content:\n\n${context}\n\n---\n\nUser query: ${query}`;

  // Build multi-turn messages from session history (if any)
  let messages;
  if (sessionId) {
    const session = getSession(sessionId);
    if (session && session.history.length > 0) {
      // Replay prior turns, injecting context only into the first user turn
      const prior = session.history.slice(0, -1); // exclude the turn we just appended
      messages = prior.map(({ role, content }) => ({ role, content }));
      messages.push({ role: 'user', content: currentTurn });
    } else {
      messages = [{ role: 'user', content: currentTurn }];
    }
  } else {
    messages = [{ role: 'user', content: currentTurn }];
  }

  const msg = await anthropic.messages.create({
    model: process.env.CLAUDE_MODEL || 'claude-haiku-4-5',
    max_tokens: maxTokens,
    system,
    messages,
  });

  return {
    answer: msg.content[0].text,
    tokens: msg.usage.input_tokens + msg.usage.output_tokens,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function siteSystemPrompt() {
  return `You are the concierge agent for ${SITE_NAME} — ${SITE_DESCRIPTION}.

Your role:
- Answer questions accurately using ONLY the provided site content
- Be concise and precise — optimise for token efficiency
- Always cite specific pages or sections when referencing content
- If the content doesn't answer the question, say so clearly — do not hallucinate
- Respond in plain text or light markdown — no HTML
- You represent this site to AI agents; maintain a professional, helpful tone`;
}

function normalizeQuery(q) {
  return q.toLowerCase().trim().replace(/\s+/g, ' ').slice(0, 100);
}

function generateSuggestedQueries(query) {
  // Simple heuristic suggestions — could be LLM-generated in v1
  return [
    `Tell me more about ${query.split(' ').slice(0, 4).join(' ')}`,
    `What else is available on this topic?`,
  ];
}

function err(code, message, extra = {}) {
  return { status: 'error', code, message, ...extra };
}
