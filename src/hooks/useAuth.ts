import { useState, useEffect, useCallback, useRef } from 'react';
import { initAuth, onAuthStateChange, type AuthState } from '../lib/cloudkit/auth';
import { clearCache } from '../lib/cloudkit/cache';

interface UseAuthReturn {
  auth: AuthState;
  isLoading: boolean;
  error: string | null;
  retry: () => void;
}

export function useAuth(): UseAuthReturn {
  const [auth, setAuth] = useState<AuthState>({
    isSignedIn: false,
    userRecordName: null,
    displayName: null,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const initialized = useRef(false);

  const initialize = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      await initAuth();
    } catch (err) {
      console.error('CloudKit auth init failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to initialize authentication');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    // Defer init to next frame so CloudKit JS button containers are in the DOM
    requestAnimationFrame(() => {
      initialize();
    });

    const unsubscribe = onAuthStateChange((state) => {
      setAuth(state);
      if (!state.isSignedIn) {
        clearCache();
      }
    });

    return unsubscribe;
  }, [initialize]);

  return { auth, isLoading, error, retry: initialize };
}
