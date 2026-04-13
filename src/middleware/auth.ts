import { Request, Response, NextFunction } from 'express';
import { logger } from '../logger';

const PROXY_SECRET = process.env.RAPIDAPI_PROXY_SECRET;

export function rapidApiAuth(req: Request, res: Response, next: NextFunction): void {
  if (process.env.NODE_ENV === 'development' && !PROXY_SECRET) {
    next();
    return;
  }

  const proxySecret = req.headers['x-rapidapi-proxy-secret'] as string | undefined;

  if (!PROXY_SECRET) {
    logger.error('RAPIDAPI_PROXY_SECRET not configured');
    res.status(500).json({ error: 'Server misconfiguration' });
    return;
  }

  if (!proxySecret || proxySecret !== PROXY_SECRET) {
    logger.warn(
      { ip: req.ip, path: req.path },
      'Rejected request: invalid proxy secret'
    );
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  next();
}
