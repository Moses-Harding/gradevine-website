import { useState, useEffect, useCallback } from 'react';
import type { Student } from '../types/cloudkit';
import { fetchStudentsForCourse } from '../lib/cloudkit/queries';
import { AuthExpiredError, ZoneNotFoundError } from '../lib/cloudkit/rest';

interface UseStudentsReturn {
  students: Student[];
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useStudents(courseID: string | null): UseStudentsReturn {
  const [students, setStudents] = useState<Student[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (forceRefresh = false) => {
      if (!courseID) return;
      setIsLoading(true);
      setError(null);
      try {
        const data = await fetchStudentsForCourse(courseID, forceRefresh);
        setStudents(data);
      } catch (err) {
        if (err instanceof AuthExpiredError) {
          setError('Session expired. Please sign in again.');
        } else if (err instanceof ZoneNotFoundError) {
          setError('No data found. Open the iOS app first.');
        } else {
          setError(err instanceof Error ? err.message : 'Failed to load students');
        }
      } finally {
        setIsLoading(false);
      }
    },
    [courseID],
  );

  useEffect(() => {
    setStudents([]);
    load();
  }, [load]);

  return { students, isLoading, error, refresh: useCallback(() => load(true), [load]) };
}
