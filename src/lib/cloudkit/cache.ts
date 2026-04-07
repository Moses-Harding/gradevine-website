/**
 * Simple in-memory session cache for CloudKit data.
 *
 * Data is cached per session (cleared on page refresh or sign-out).
 * Each entry has a TTL after which it's considered stale and re-fetched.
 */

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry<T> {
  data: T;
  cachedAt: number;
  ttlMs: number;
}

const store = new Map<string, CacheEntry<unknown>>();

/**
 * Get a cached value, or null if expired/missing.
 */
export function getCache<T>(key: string): T | null {
  const entry = store.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;

  const age = Date.now() - entry.cachedAt;
  if (age > entry.ttlMs) {
    store.delete(key);
    return null;
  }

  return entry.data;
}

/**
 * Set a cached value with optional TTL.
 */
export function setCache<T>(key: string, data: T, ttlMs = DEFAULT_TTL_MS): void {
  store.set(key, { data, cachedAt: Date.now(), ttlMs });
}

/**
 * Invalidate a specific cache key.
 */
export function invalidateCache(key: string): void {
  store.delete(key);
}

/**
 * Invalidate all cache entries matching a prefix.
 * e.g., invalidateCachePrefix('students-') clears all per-course student caches.
 */
export function invalidateCachePrefix(prefix: string): void {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) {
      store.delete(key);
    }
  }
}

/**
 * Clear the entire cache (e.g., on sign-out).
 */
export function clearCache(): void {
  store.clear();
}
