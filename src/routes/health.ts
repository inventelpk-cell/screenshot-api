import { Router, Request, Response } from 'express';
import { getBrowserStats } from '../services/browser';
import { getCacheStats } from '../services/cache';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  const browser = getBrowserStats();
  const cache = getCacheStats();

  res.json({
    status: browser.connected ? 'healthy' : 'degraded',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    browser,
    cache,
    memory: {
      rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
      heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    },
  });
});

export default router;
