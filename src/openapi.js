/**
 * AHP → OpenAPI 3.1.x spec generator
 * Spec: Appendix E
 *
 * Generates a valid OpenAPI 3.1.0 document from the AHP manifest,
 * mapping each capability to a distinct path operation.
 * Enables ChatGPT Custom GPTs and any OpenAPI-compatible client.
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

function loadManifest() {
  return JSON.parse(readFileSync(join(ROOT, '.well-known', 'agent.json'), 'utf8'));
}

// ── AHPResponse shared schema ─────────────────────────────────────────────────

const AHPResponseSchema = {
  type: 'object',
  properties: {
    status: {
      type: 'string',
      enum: ['success', 'clarification_needed', 'accepted', 'error'],
      description: 'Response status',
    },
    session_id: {
      type: 'string',
      description: 'Session ID for multi-turn conversations',
    },
    response: {
      type: 'object',
      properties: {
        content_type: { type: 'string' },
        answer: { type: 'string', description: 'Natural language answer' },
        sources: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              url: { type: 'string' },
              excerpt: { type: 'string' },
            },
          },
        },
      },
    },
    meta: {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['MODE1', 'MODE2', 'MODE3'] },
        cached: { type: 'boolean' },
        tokens_used: { type: 'integer' },
        fallback_from: { type: 'string' },
      },
    },
    clarification_question: {
      type: 'string',
      description: 'Present when status is clarification_needed',
    },
    poll: {
      type: 'string',
      description: 'Polling URL for async responses (status: accepted)',
    },
    eta_seconds: {
      type: 'integer',
      description: 'Estimated seconds until async result is ready',
    },
  },
};

// ── Capability → OpenAPI path item (Appendix E.2) ─────────────────────────────

function capabilityToPath(cap, requiresAuth) {
  const requestSchema = {
    type: 'object',
    required: ['query'],
    properties: {
      query: {
        type: 'string',
        description: 'Natural language query or instruction for this capability',
      },
      session_id: {
        type: 'string',
        description: 'Optional: continue an existing multi-turn conversation',
      },
      context: {
        type: 'object',
        description: 'Optional: additional context (locale, accept_types, etc.)',
        properties: {
          accept_types: {
            type: 'array',
            items: { type: 'string' },
            description: 'Content types the calling agent can handle',
          },
        },
      },
    },
  };

  const responses = {
    '200': {
      description: 'Successful response',
      content: { 'application/json': { schema: { $ref: '#/components/schemas/AHPResponse' } } },
    },
    '400': { description: 'Invalid request — missing required fields or malformed JSON' },
    '401': { description: 'Authentication required' },
    '429': {
      description: 'Rate limit exceeded',
      headers: {
        'X-RateLimit-Limit': { schema: { type: 'integer' } },
        'X-RateLimit-Remaining': { schema: { type: 'integer' } },
        'X-RateLimit-Reset': { schema: { type: 'integer' } },
        'Retry-After': { schema: { type: 'integer' } },
      },
    },
  };

  if (cap.action_type === 'async') {
    responses['200'].description =
      'Accepted — async operation. Poll the `poll` URL or provide a webhook in context.';
  }

  return {
    post: {
      operationId: cap.name,
      summary: cap.description,
      description:
        `AHP ${cap.mode} capability. ` +
        (cap.action_type === 'async'
          ? 'This is an async operation — the initial response returns status "accepted" with a polling URL. '
          : '') +
        (cap.accept_fallback
          ? 'Supports fallback to text/answer if the requested content type is unavailable.'
          : ''),
      tags: [cap.mode],
      ...(requiresAuth && { security: [{ bearerAuth: [] }] }),
      requestBody: {
        required: true,
        content: { 'application/json': { schema: requestSchema } },
      },
      responses,
    },
  };
}

// ── Main spec generator ───────────────────────────────────────────────────────

export function generateOpenAPISpec(req) {
  const manifest = loadManifest();

  const proto = req?.headers?.['x-forwarded-proto'] || 'https';
  const host = req?.headers?.['x-forwarded-host'] || req?.headers?.host || 'localhost';
  const baseUrl = `${proto}://${host}`;

  const requiresAuth = manifest.authentication !== 'none';

  // Only expose MODE2 and MODE3 capabilities (MODE1 is static fetching)
  const exposedCaps = manifest.capabilities.filter(
    c => c.mode === 'MODE2' || c.mode === 'MODE3'
  );

  const paths = {};
  for (const cap of exposedCaps) {
    paths[`/capabilities/${cap.name}`] = capabilityToPath(cap, requiresAuth);
  }

  const spec = {
    openapi: '3.1.0',
    info: {
      title: manifest.name,
      description:
        `${manifest.description}\n\n` +
        `This API is generated from an AHP (Agent Handshake Protocol) manifest. ` +
        `Each operation maps to an AHP capability. Authentication and rate limiting ` +
        `are enforced per the AHP spec. Full manifest: ${baseUrl}/.well-known/agent.json`,
      version: manifest.ahp,
      contact: {
        url: 'https://agenthandshake.dev',
        name: 'AHP Specification',
      },
    },
    servers: [
      {
        url: baseUrl,
        description: manifest.name,
      },
    ],
    paths,
    components: {
      schemas: {
        AHPResponse: AHPResponseSchema,
      },
      ...(requiresAuth && {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            description: 'Bearer token issued by the site operator',
          },
        },
      }),
    },
    tags: [
      { name: 'MODE2', description: 'Conversational knowledge queries' },
      { name: 'MODE3', description: 'Agentic tool use and delegation' },
    ],
  };

  return spec;
}
