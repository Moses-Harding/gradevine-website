import { useState, useEffect, useCallback } from 'react';
import type { Course } from '../types/cloudkit';
import { fetchCourses } from '../lib/cloudkit/queries';
import { AuthExpiredError, ZoneNotFoundError } from '../lib/cloudkit/rest';

interface UseCoursesReturn {
  courses: Course[];
  isLoading: boolean;
  error: string | null;
  errorType: 'auth' | 'zone' | 'network' | null;
  refresh: () => void;
}

export function useCourses(isSignedIn: boolean): UseCoursesReturn {
  const [courses, setCourses] = useState<Course[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorType, setErrorType] = useState<'auth' | 'zone' | 'network' | null>(null);

  const load = useCallback(
    async (forceRefresh = false) => {
      if (!isSignedIn) return;

      setIsLoading(true);
      setError(null);
      setErrorType(null);

      try {
        const data = await fetchCourses(forceRefresh);
        setCourses(data);
      } catch (err) {
        if (err instanceof AuthExpiredError) {
          setError('Your session has expired. Please sign in again.');
          setErrorType('auth');
        } else if (err instanceof ZoneNotFoundError) {
          setError(
            'No GradeVine data found. Please open the iOS app at least once to set up sync.',
          );
          setErrorType('zone');
        } else if (err instanceof TypeError && err.message.includes('fetch')) {
          setError('Network error. Please check your connection and try again.');
          setErrorType('network');
        } else {
          setError(err instanceof Error ? err.message : 'Failed to load courses');
          setErrorType('network');
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

  const refresh = useCallback(() => load(true), [load]);

  return { courses, isLoading, error, errorType, refresh };
}
