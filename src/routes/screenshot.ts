import { Router, Request, Response } from 'express';
import { validateUrl } from '../utils/validateUrl';
import { withPage } from '../services/browser';
import { buildCacheKey, getFromCache, setInCache } from '../services/cache';
import { logger } from '../logger';

const router = Router();

const ALLOWED_FORMATS = ['png', 'jpeg', 'webp'] as const;
type ImageFormat = (typeof ALLOWED_FORMATS)[number];

interface ScreenshotParams {
  url: string;
  width: number;
  height: number;
  format: ImageFormat;
  quality: number;
  fullPage: boolean;
  delay: number;
  output: 'binary' | 'base64';
}

function parseParams(query: Request['query']): ScreenshotParams | { error: string } {
  const urlResult = validateUrl(query.url as string);
  if (!urlResult.valid) {
    return { error: urlResult.error! };
  }

  const width = Math.min(Math.max(parseInt(String(query.width || '1280'), 10) || 1280, 320), 3840);
  const height = Math.min(Math.max(parseInt(String(query.height || '720'), 10) || 720, 240), 2160);

  const format = ALLOWED_FORMATS.includes(query.format as ImageFormat)
    ? (query.format as ImageFormat)
    : 'png';

  const quality = format === 'png'
    ? 100
    : Math.min(Math.max(parseInt(String(query.quality || '80'), 10) || 80, 1), 100);

  const fullPage = query.fullPage === 'true';
  const delay = Math.min(Math.max(parseInt(String(query.delay || '0'), 10) || 0, 0), 10000);

  const output = query.output === 'base64' ? 'base64' : 'binary';

  return { url: urlResult.url!, width, height, format, quality, fullPage, delay, output };
}

router.get('/', async (req: Request, res: Response) => {
  const params = parseParams(req.query);
  if ('error' in params) {
    res.status(400).json({ error: params.error });
    return;
  }

  const cacheKey = buildCacheKey({
    type: 'screenshot',
    url: params.url,
    width: params.width,
    height: params.height,
    format: params.format,
    quality: params.quality,
    fullPage: params.fullPage,
    delay: params.delay,
  });

  const cached = getFromCache(cacheKey);
  if (cached) {
    if (params.output === 'base64') {
      res.json({ data: cached.data.toString('base64'), contentType: cached.contentType });
      return;
    }
    res.set('Content-Type', cached.contentType);
    res.set('X-Cache', 'HIT');
    res.send(cached.data);
    return;
  }

  const startTime = Date.now();

  try {
    const screenshot = await withPage(async (page) => {
      await page.setViewport({ width: params.width, height: params.height });
      await page.goto(params.url, { waitUntil: 'networkidle2' });

      if (params.delay > 0) {
        await new Promise((r) => setTimeout(r, params.delay));
      }

      const opts: Parameters<typeof page.screenshot>[0] = {
        type: params.format === 'webp' ? 'webp' : params.format,
        fullPage: params.fullPage,
        ...(params.format !== 'png' && { quality: params.quality }),
      };

      return page.screenshot(opts);
    });

    const buffer = Buffer.isBuffer(screenshot)
      ? screenshot
      : Buffer.from(screenshot as Uint8Array);

    const contentType = `image/${params.format}`;
    setInCache(cacheKey, buffer, contentType);

    logger.info(
      { url: params.url, format: params.format, size: buffer.length, durationMs: Date.now() - startTime },
      'Screenshot captured'
    );

    if (params.output === 'base64') {
      res.json({ data: buffer.toString('base64'), contentType });
      return;
    }

    res.set('Content-Type', contentType);
    res.set('X-Cache', 'MISS');
    res.set('Content-Length', String(buffer.length));
    res.send(buffer);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error({ err, url: params.url }, 'Screenshot failed');

    if (message.includes('timeout') || message.includes('Timeout')) {
      res.status(504).json({ error: 'Page load timed out' });
      return;
    }

    res.status(500).json({ error: 'Failed to capture screenshot' });
  }
});

export default router;
