/**
 * AHP Authentication middleware.
 * MODE3 action capabilities require authentication.
 * Supports: bearer token, api_key header.
 */

const VALID_TOKENS = new Set(
  (process.env.API_TOKENS || '').split(',').filter(Boolean)
);

export function requireAuth(req, res, next) {
  const token = extractToken(req);
  if (!token || !VALID_TOKENS.has(token)) {
    return res.status(401).json({
      status: 'error',
      code: 'auth_required',
      message: 'This capability requires authentication. Provide a Bearer token or X-AHP-Key header.',
    });
  }
  req.agentToken = token;
  next();
}

export function optionalAuth(req, res, next) {
  req.agentToken = extractToken(req) || null;
  req.isAuthenticated = req.agentToken && VALID_TOKENS.has(req.agentToken);
  next();
}

function extractToken(req) {
  const auth = req.headers['authorization'];
  if (auth?.startsWith('Bearer ')) return auth.slice(7).trim();
  const key = req.headers['x-ahp-key'];
  if (key) return key.trim();
  return null;
}
