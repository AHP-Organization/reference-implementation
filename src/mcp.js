/**
 * AHP → MCP (Model Context Protocol) bridge
 * Spec: Appendix D
 *
 * Exposes AHP capabilities as MCP tools and resources over JSON-RPC 2.0.
 * Claude Desktop, the Claude API in agentic mode, and any MCP-compatible
 * client can connect to this endpoint without knowing AHP exists.
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const MCP_VERSION = '2024-11-05';

function loadManifest() {
  return JSON.parse(readFileSync(join(ROOT, '.well-known', 'agent.json'), 'utf8'));
}

// ── Capability → MCP tool mapping (Appendix D.3) ─────────────────────────────

function capabilityToTool(cap) {
  const inputSchema = {
    type: 'object',
    required: ['query'],
    properties: {
      query: {
        type: 'string',
        description: 'Natural language query or instruction',
      },
      session_id: {
        type: 'string',
        description: 'Optional: continue an existing conversation session',
      },
    },
  };

  return {
    name: cap.name,
    description: cap.description,
    inputSchema,
  };
}

function capabilityToResource(cap, baseUrl) {
  return {
    uri: `${baseUrl}/capabilities/${cap.name}`,
    name: cap.name,
    description: cap.description,
    mimeType: 'application/json',
  };
}

// ── JSON-RPC 2.0 helpers ──────────────────────────────────────────────────────

function ok(id, result) {
  return { jsonrpc: '2.0', id, result };
}

function err(id, code, message) {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

// ── Method handlers ───────────────────────────────────────────────────────────

async function handleInitialize(id) {
  const manifest = loadManifest();
  return ok(id, {
    protocolVersion: MCP_VERSION,
    capabilities: { tools: {}, resources: {} },
    serverInfo: {
      name: manifest.name,
      version: '0.1',
      ahp: manifest.ahp,
      manifest: '/.well-known/agent.json',
    },
  });
}

async function handleToolsList(id) {
  const manifest = loadManifest();
  const tools = manifest.capabilities
    .filter(c => c.mode === 'MODE3' || c.mode === 'MODE2')
    .map(capabilityToTool);

  return ok(id, { tools });
}

async function handleToolsCall(id, params, req) {
  const { name, arguments: args } = params;
  const manifest = loadManifest();

  const cap = manifest.capabilities.find(c => c.name === name);
  if (!cap) return err(id, -32602, `Unknown tool: ${name}`);

  // Extract auth — from _meta.auth or Authorization header (Appendix D.5)
  const bearerFromMeta = params._meta?.auth;
  const bearerFromHeader = req.headers.authorization;
  const auth = bearerFromMeta || bearerFromHeader || undefined;

  // Proxy to AHP /agent/converse
  const baseUrl = `http://localhost:${process.env.PORT || 3000}`;
  const body = {
    capability: name,
    query: args.query,
    ...(args.session_id && { session_id: args.session_id }),
    ...(auth && { auth }),
  };

  try {
    const resp = await fetch(`${baseUrl}/agent/converse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await resp.json();
    const answer = data?.response?.answer ?? JSON.stringify(data);
    const isError = data?.status === 'error';

    return ok(id, {
      content: [
        { type: 'text', text: answer },
        ...(data?.response?.sources?.length
          ? [{ type: 'text', text: `Sources: ${JSON.stringify(data.response.sources)}` }]
          : []),
      ],
      isError,
      ...(data.session_id && { _meta: { session_id: data.session_id } }),
    });
  } catch (e) {
    return err(id, -32603, `Proxy error: ${e.message}`);
  }
}

async function handleResourcesList(id, req) {
  const manifest = loadManifest();
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const baseUrl = `${proto}://${host}`;

  const resources = manifest.capabilities
    .filter(c => c.mode === 'MODE1' || c.mode === 'MODE2')
    .map(c => capabilityToResource(c, baseUrl));

  // Add llms.txt as a resource if it exists
  if (manifest.endpoints?.content) {
    resources.unshift({
      uri: `${baseUrl}${manifest.endpoints.content}`,
      name: 'site_content',
      description: 'Full site content index (llms.txt / MODE1)',
      mimeType: 'text/plain',
    });
  }

  return ok(id, { resources });
}

async function handleResourcesRead(id, params) {
  // Simple proxy: fetch the resource URI
  try {
    const resp = await fetch(params.uri);
    const text = await resp.text();
    return ok(id, {
      contents: [{ uri: params.uri, mimeType: 'text/plain', text }],
    });
  } catch (e) {
    return err(id, -32603, `Resource fetch error: ${e.message}`);
  }
}

// ── Main dispatcher ───────────────────────────────────────────────────────────

export async function handleMCP(req, res) {
  res.setHeader('Content-Type', 'application/json');

  let body;
  try {
    body = req.body;
  } catch {
    return res.status(400).json(err(null, -32700, 'Parse error'));
  }

  const { jsonrpc, id, method, params = {} } = body;

  if (jsonrpc !== '2.0') {
    return res.json(err(id ?? null, -32600, 'Invalid Request: jsonrpc must be "2.0"'));
  }

  let result;
  try {
    switch (method) {
      case 'initialize':
        result = await handleInitialize(id);
        break;
      case 'initialized':
        // Notification — no response needed
        return res.status(204).end();
      case 'tools/list':
        result = await handleToolsList(id);
        break;
      case 'tools/call':
        result = await handleToolsCall(id, params, req);
        break;
      case 'resources/list':
        result = await handleResourcesList(id, req);
        break;
      case 'resources/read':
        result = await handleResourcesRead(id, params);
        break;
      default:
        result = err(id, -32601, `Method not found: ${method}`);
    }
  } catch (e) {
    result = err(id, -32603, `Internal error: ${e.message}`);
  }

  res.json(result);
}
