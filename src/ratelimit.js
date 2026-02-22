import rateLimit from 'express-rate-limit';

const WINDOW_SECONDS = 60;
const MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_RPM || '30');

export function createRateLimiter() {
  const limiter = rateLimit({
    windowMs: WINDOW_SECONDS * 1000,
    max: MAX_REQUESTS,
    standardHeaders: false, // disable IETF RateLimit-* headers
    legacyHeaders: true,    // enable X-RateLimit-Limit/Remaining/Reset
    handler: (req, res) => {
      const resetSec = req.rateLimit?.resetTime
        ? Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000)
        : WINDOW_SECONDS;
      res.status(429).json({
        status: 'error',
        code: 'rate_limited',
        message: 'Rate limit exceeded. See Retry-After header.',
        scope: 'ip',
        retry_after: resetSec,
      });
    },
  });

  // Middleware wrapper: run limiter then inject X-RateLimit-Window (not in legacy headers)
  return (req, res, next) => {
    limiter(req, res, (err) => {
      if (err) return next(err);
      res.setHeader('X-RateLimit-Window', String(WINDOW_SECONDS));
      next();
    });
  };
}
