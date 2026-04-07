import { useState, useEffect, useCallback } from 'react';
import type { ScanPage } from '../types/cloudkit';
import { fetchScanPages } from '../lib/cloudkit/queries';
import { invalidateCache } from '../lib/cloudkit/cache';

interface UseScanPagesReturn {
  pages: ScanPage[];
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useScanPages(scanID: string | null): UseScanPagesReturn {
  const [pages, setPages] = useState<ScanPage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (forceRefresh = false) => {
      if (!scanID) return;
      setIsLoading(true);
      setError(null);
      // Always force fresh fetch for scan pages (asset URLs expire)
      invalidateCache(`scanpages-${scanID}`);
      try {
        const data = await fetchScanPages(scanID, true);
        setPages(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load scan pages');
      } finally {
        setIsLoading(false);
      }
    },
    [scanID],
  );

  useEffect(() => {
    setPages([]);
    load();
  }, [load]);

  return { pages, isLoading, error, refresh: useCallback(() => load(true), [load]) };
}

/**
 * Prefetch scan pages for upcoming students (fire-and-forget).
 * Call this with the next student's scan ID to warm the cache.
 */
export function prefetchScanPages(scanID: string): void {
  fetchScanPages(scanID, false).catch(() => {
    // Silently ignore prefetch errors
  });
}
