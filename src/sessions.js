import { randomUUID } from 'crypto';

const MAX_TURNS = 10;
const TTL_MS = 10 * 60 * 1000; // 10 minutes

const sessions = new Map();

export function createSession() {
  const id = randomUUID();
  sessions.set(id, {
    id,
    turns: 0,
    history: [],
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
    status: 'active',
    pendingResponse: null,
  });
  return id;
}

export function getSession(id) {
  const s = sessions.get(id);
  if (!s) return null;
  if (Date.now() - s.lastActivityAt > TTL_MS) {
    s.status = 'expired';
    return s;
  }
  return s;
}

export function touchSession(id) {
  const s = sessions.get(id);
  if (s) {
    s.lastActivityAt = Date.now();
    s.turns += 1;
  }
}

export function appendHistory(id, role, content) {
  const s = sessions.get(id);
  if (s) s.history.push({ role, content });
}

export function isExhausted(id) {
  const s = sessions.get(id);
  return s ? s.turns >= MAX_TURNS : false;
}

export function setAsyncPending(id, data) {
  const s = sessions.get(id);
  if (s) {
    s.status = 'pending';
    s.pendingResponse = data;
  }
}

export function resolveAsync(id, response) {
  const s = sessions.get(id);
  if (s) {
    s.status = 'success';
    s.pendingResponse = response;
  }
}

// Prune expired sessions every 5 minutes
setInterval(() => {
  const cutoff = Date.now() - TTL_MS;
  for (const [id, s] of sessions) {
    if (s.lastActivityAt < cutoff) sessions.delete(id);
  }
}, 5 * 60 * 1000);
