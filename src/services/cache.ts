import { LRUCache } from 'lru-cache';
import crypto from 'crypto';
import { logger } from '../logger';

interface CacheEntry {
  data: Buffer;
  contentType: string;
}

const cache = new LRUCache<string, CacheEntry>({
  max: parseInt(process.env.CACHE_MAX_ITEMS || '200', 10),
  ttl: parseInt(process.env.CACHE_TTL_MS || '300000', 10),
  maxSize: 500 * 1024 * 1024, // 500MB max total size
  sizeCalculation: (entry) => entry.data.length,
});

export function buildCacheKey(params: Record<string, unknown>): string {
  const sorted = JSON.stringify(params, Object.keys(params).sort());
  return crypto.createHash('sha256').update(sorted).digest('hex');
}

export function getFromCache(key: string): CacheEntry | undefined {
  const entry = cache.get(key);
  if (entry) {
    logger.debug({ key: key.slice(0, 12) }, 'Cache hit');
  }
  return entry;
}

export function setInCache(key: string, data: Buffer, contentType: string): void {
  cache.set(key, { data, contentType });
  logger.debug({ key: key.slice(0, 12), size: data.length }, 'Cache set');
}

export function getCacheStats() {
  return {
    size: cache.size,
    calculatedSize: cache.calculatedSize,
    maxSize: 500 * 1024 * 1024,
  };
}
