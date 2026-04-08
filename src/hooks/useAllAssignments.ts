import { useState, useEffect, useCallback } from 'react';
import type { QuestionAssignment } from '../types/cloudkit';
import { fetchAllAssignments } from '../lib/cloudkit/queries';
import { AuthExpiredError, ZoneNotFoundError } from '../lib/cloudkit/rest';

interface UseAllAssignmentsReturn {
  assignments: QuestionAssignment[];
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useAllAssignments(isSignedIn: boolean): UseAllAssignmentsReturn {
  const [assignments, setAssignments] = useState<QuestionAssignment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (forceRefresh = false) => {
      if (!isSignedIn) return;
      setIsLoading(true);
      setError(null);
      try {
        const data = await fetchAllAssignments(forceRefresh);
        setAssignments(data);
      } catch (err) {
        if (err instanceof AuthExpiredError) {
          setError('Session expired. Please sign in again.');
        } else if (err instanceof ZoneNotFoundError) {
          setError('No data found. Open the iOS app first.');
        } else {
          setError(err instanceof Error ? err.message : 'Failed to load assignments');
        }
      } finally {
        setIsLoading(false);
      }
    },
    [isSignedIn],
  );

  useEffect(() => {
    load();
  }, [load]);

  return { assignments, isLoading, error, refresh: useCallback(() => load(true), [load]) };
}
