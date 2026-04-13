import { Request, Response, NextFunction } from 'express';

const WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10);
const MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '30', 10);

interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

const buckets = new Map<string, TokenBucket>();

// Periodic cleanup to prevent memory leak from abandoned keys
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (now - bucket.lastRefill > WINDOW_MS * 5) {
      buckets.delete(key);
    }
  }
}, WINDOW_MS * 2);

function getApiKey(req: Request): string {
  return (req.headers['x-rapidapi-user'] as string) || req.ip || 'anonymous';
}

export function rateLimit(req: Request, res: Response, next: NextFunction): void {
  const key = getApiKey(req);
  const now = Date.now();

  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { tokens: MAX_REQUESTS, lastRefill: now };
    buckets.set(key, bucket);
  }

  const elapsed = now - bucket.lastRefill;
  const refillAmount = (elapsed / WINDOW_MS) * MAX_REQUESTS;
  bucket.tokens = Math.min(MAX_REQUESTS, bucket.tokens + refillAmount);
  bucket.lastRefill = now;

  if (bucket.tokens < 1) {
    const retryAfter = Math.ceil(((1 - bucket.tokens) / MAX_REQUESTS) * WINDOW_MS / 1000);
    res.set('Retry-After', String(retryAfter));
    res.status(429).json({
      error: 'Rate limit exceeded',
      retryAfterSeconds: retryAfter,
    });
    return;
  }

  bucket.tokens -= 1;

  res.set('X-RateLimit-Limit', String(MAX_REQUESTS));
  res.set('X-RateLimit-Remaining', String(Math.floor(bucket.tokens)));

  next();
}
