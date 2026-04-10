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
    requestAnimationFrame(async () => {
      await initialize();

      // If ?login=1 param is present, auto-click the Apple sign-in button
      // once CloudKit JS has rendered it into #apple-sign-in-button.
      const params = new URLSearchParams(window.location.search);
      if (params.get('login') === '1') {
        // Clean up the URL
        window.history.replaceState({}, '', window.location.pathname);

        // CloudKit JS renders the Apple sign-in control asynchronously into
        // #apple-sign-in-button. Poll until it appears, then trigger the click.
        const container = document.getElementById('apple-sign-in-button');
        if (!container) return;

        const tryClick = (): boolean => {
          const btn = container.querySelector('a, button') as HTMLElement | null;
          if (btn) {
            btn.click();
            return true;
          }
          return false;
        };

        if (!tryClick()) {
          // Poll every 100ms for up to 5 seconds
          const start = Date.now();
          const interval = window.setInterval(() => {
            if (tryClick() || Date.now() - start > 5000) {
              window.clearInterval(interval);
            }
          }, 100);
        }
      }
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
