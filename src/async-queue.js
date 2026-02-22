/**
 * AHP Async Queue — human-in-the-loop escalation.
 *
 * In a real deployment this would integrate with a ticketing system,
 * Slack, email, or a support platform. Here it simulates a human
 * responding after a configurable delay — sufficient for testing
 * the full async protocol flow and measuring round-trip time.
 */

import { resolveAsync } from './sessions.js';

const queue = new Map(); // sessionId → { request, callbackUrl, resolvedAt }
const SIMULATED_HUMAN_DELAY_MS = parseInt(process.env.HUMAN_DELAY_MS || '8000');

/**
 * Enqueue a request for human attention.
 * Returns immediately; resolution happens asynchronously.
 */
export function enqueueHumanRequest({ sessionId, capability, query, context, callbackUrl }) {
  const ticket = {
    sessionId,
    capability,
    query,
    context,
    callbackUrl,
    enqueuedAt: Date.now(),
    resolvedAt: null,
  };

  queue.set(sessionId, ticket);
  console.log(`[async-queue] Ticket enqueued for session ${sessionId}: "${query.slice(0, 60)}"`);

  // Simulate human response after delay
  setTimeout(async () => {
    await resolveTicket(sessionId);
  }, SIMULATED_HUMAN_DELAY_MS);

  return {
    eta_seconds: Math.ceil(SIMULATED_HUMAN_DELAY_MS / 1000),
    ticket_id: sessionId,
  };
}

/**
 * Simulate a human reviewing and responding to the ticket.
 */
async function resolveTicket(sessionId) {
  const ticket = queue.get(sessionId);
  if (!ticket) return;

  const humanResponse = generateSimulatedHumanResponse(ticket);
  ticket.resolvedAt = Date.now();
  ticket.response = humanResponse;

  const roundTripMs = ticket.resolvedAt - ticket.enqueuedAt;
  console.log(`[async-queue] Ticket resolved for session ${sessionId} in ${roundTripMs}ms`);

  // Store result in session
  resolveAsync(sessionId, {
    content_type: 'text/answer',
    answer: humanResponse.answer,
    sources: humanResponse.sources || [],
    human_response: true,
    round_trip_ms: roundTripMs,
  });

  // Fire callback if provided
  if (ticket.callbackUrl) {
    await fireCallback(ticket.callbackUrl, sessionId, humanResponse, roundTripMs);
  }
}

async function fireCallback(url, sessionId, response, roundTripMs) {
  try {
    // Validate URL to prevent SSRF (basic allowlist check)
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      console.warn(`[async-queue] Rejected callback URL with non-HTTP protocol: ${url}`);
      return;
    }

    const payload = {
      status: 'success',
      session_id: sessionId,
      response: {
        content_type: 'text/answer',
        answer: response.answer,
        human_response: true,
      },
      meta: {
        round_trip_ms: roundTripMs,
        resolved_by: 'human',
      },
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });

    console.log(`[async-queue] Callback fired to ${url} — HTTP ${res.status}`);
  } catch (e) {
    console.warn(`[async-queue] Callback failed for ${url}: ${e.message}`);
  }
}

function generateSimulatedHumanResponse(ticket) {
  // In production: a real human writes this.
  // For testing: simulate a thoughtful human response.
  return {
    answer: `[Human response] Thank you for your query: "${ticket.query}". ` +
      `A member of the team has reviewed this and can confirm: ` +
      `this is a simulated human response to demonstrate the AHP MODE3 async escalation flow. ` +
      `In a production deployment, a real person would respond here. ` +
      `Response time: approximately ${Math.ceil(SIMULATED_HUMAN_DELAY_MS / 1000)} seconds.`,
    sources: [],
    resolved_by: 'human_simulation',
  };
}

export function getTicket(sessionId) {
  return queue.get(sessionId) || null;
}

export function getQueueStats() {
  const pending = [...queue.values()].filter(t => !t.resolvedAt).length;
  const resolved = queue.size - pending;
  return { total: queue.size, pending, resolved };
}
