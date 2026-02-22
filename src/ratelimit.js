import rateLimit from 'express-rate-limit';

export function createRateLimiter() {
  return rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: parseInt(process.env.RATE_LIMIT_RPM || '30'),
    standardHeaders: true,
    legacyHeaders: false,
    // Add AHP-specific rate limit headers
    handler: (req, res) => {
      res.status(429).json({
        status: 'error',
        code: 'rate_limited',
        message: 'Rate limit exceeded. See Retry-After header.',
        scope: 'ip',
        retry_after: Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000),
      });
    },
    // Add AHP headers to every response
    skip: (req, res) => false,
  });
}
