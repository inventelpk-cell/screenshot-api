import { Router, Request, Response } from 'express';
import { validateUrl } from '../utils/validateUrl';
import { withPage } from '../services/browser';
import { buildCacheKey, getFromCache, setInCache } from '../services/cache';
import { logger } from '../logger';
import { PaperFormat } from 'puppeteer';

const router = Router();

const ALLOWED_FORMATS: PaperFormat[] = ['A4', 'Letter', 'Legal', 'Tabloid', 'A3', 'A5'];

interface PdfParams {
  url: string;
  format: PaperFormat;
  landscape: boolean;
  margin: number;
  output: 'binary' | 'base64';
}

function parseParams(query: Request['query']): PdfParams | { error: string } {
  const urlResult = validateUrl(query.url as string);
  if (!urlResult.valid) {
    return { error: urlResult.error! };
  }

  const rawFormat = String(query.format || 'A4');
  const format = ALLOWED_FORMATS.includes(rawFormat as PaperFormat)
    ? (rawFormat as PaperFormat)
    : 'A4';

  const landscape = query.landscape === 'true';
  const margin = Math.min(Math.max(parseInt(String(query.margin || '10'), 10) || 10, 0), 100);
  const output = query.output === 'base64' ? 'base64' : 'binary';

  return { url: urlResult.url!, format, landscape, margin, output };
}

router.get('/', async (req: Request, res: Response) => {
  const params = parseParams(req.query);
  if ('error' in params) {
    res.status(400).json({ error: params.error });
    return;
  }

  const cacheKey = buildCacheKey({
    type: 'pdf',
    url: params.url,
    format: params.format,
    landscape: params.landscape,
    margin: params.margin,
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
  const marginStr = `${params.margin}mm`;

  try {
    const pdfBuffer = await withPage(async (page) => {
      await page.goto(params.url, { waitUntil: 'networkidle2' });

      return page.pdf({
        format: params.format,
        landscape: params.landscape,
        margin: { top: marginStr, right: marginStr, bottom: marginStr, left: marginStr },
        printBackground: true,
      });
    });

    const buffer = Buffer.isBuffer(pdfBuffer)
      ? pdfBuffer
      : Buffer.from(pdfBuffer as Uint8Array);

    const contentType = 'application/pdf';
    setInCache(cacheKey, buffer, contentType);

    logger.info(
      { url: params.url, format: params.format, size: buffer.length, durationMs: Date.now() - startTime },
      'PDF generated'
    );

    if (params.output === 'base64') {
      res.json({ data: buffer.toString('base64'), contentType });
      return;
    }

    res.set('Content-Type', contentType);
    res.set('X-Cache', 'MISS');
    res.set('Content-Length', String(buffer.length));
    res.set('Content-Disposition', 'inline; filename="document.pdf"');
    res.send(buffer);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error({ err, url: params.url }, 'PDF generation failed');

    if (message.includes('timeout') || message.includes('Timeout')) {
      res.status(504).json({ error: 'Page load timed out' });
      return;
    }

    res.status(500).json({ error: 'Failed to generate PDF' });
  }
});

export default router;
