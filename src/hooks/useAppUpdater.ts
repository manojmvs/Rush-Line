import { useCallback, useEffect, useRef, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';

export type AppUpdateStatus = 'idle' | 'checking' | 'up-to-date' | 'ready' | 'updating';

const LAST_APPLIED_VER_KEY = 'apex-circuit-last-applied-ver';
const LAST_RELOAD_AT_KEY = 'apex-circuit-last-reload-at';

// Module-level Service Worker controller singleton so React remounts never double-register
let swInitialized = false;
let swRegistration: ServiceWorkerRegistration | null = null;
let swApplyFn: ((reloadPage?: boolean) => Promise<void>) | null = null;
const swNeedRefreshListeners = new Set<() => void>();

function initServiceWorkerBridge() {
  if (swInitialized || typeof window === 'undefined') return;
  swInitialized = true;

  try {
    swApplyFn = registerSW({
      immediate: true,
      onRegisteredSW(_swUrl, registration) {
        if (registration) {
          swRegistration = registration;
          // Immediately check for a newer SW build on app open
          void registration.update().catch(() => undefined);
        }
      },
      onNeedRefresh() {
        swNeedRefreshListeners.forEach((fn) => fn());
      },
    });
  } catch {
    // Graceful fallback if SW registration is unavailable in restricted contexts
  }
}

async function clearStaleCaches(): Promise<void> {
  if (typeof window === 'undefined' || !('caches' in window)) return;
  try {
    const keys = await window.caches.keys();
    await Promise.all(keys.map((key) => window.caches.delete(key)));
  } catch {
    // ignore
  }
}

function canAutoReloadForVersion(version: string): boolean {
  try {
    const lastVer = sessionStorage.getItem(LAST_APPLIED_VER_KEY);
    const lastAt = Number(sessionStorage.getItem(LAST_RELOAD_AT_KEY) || '0');
    if (lastVer === version && Date.now() - lastAt < 15000) {
      return false;
    }
  } catch {
    // ignore storage errors
  }
  return true;
}

function markReloadForVersion(version: string): void {
  try {
    sessionStorage.setItem(LAST_APPLIED_VER_KEY, version);
    sessionStorage.setItem(LAST_RELOAD_AT_KEY, String(Date.now()));
  } catch {
    // ignore
  }
}

interface UseAppUpdaterOptions {
  /** When true (actively racing mid-lap), queues the update instead of interrupting the player. */
  deferReload: boolean;
  /** Latest version pushed live over WebSocket from server.ts */
  serverVersion: string | null;
}

/**
 * Keeps installed mobile PWAs and browser sessions continuously synced with the live server.
 * Detects updates via real-time WebSocket push, Service Worker lifecycle, and foreground/focus checks,
 * purges stale caches, and cleanly reloads to reflect every update automatically.
 */
export function useAppUpdater({ deferReload, serverVersion }: UseAppUpdaterOptions) {
  const [status, setStatus] = useState<AppUpdateStatus>('idle');
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);
  const [pendingVersion, setPendingVersion] = useState<string | null>(null);

  const bootVersionRef = useRef<string | null>(null);
  const deferReloadRef = useRef(deferReload);
  const reloadingRef = useRef(false);

  useEffect(() => {
    deferReloadRef.current = deferReload;
  }, [deferReload]);

  const applyUpdate = useCallback(async (targetVersion?: string) => {
    if (reloadingRef.current) return;
    const versionTag = targetVersion ?? pendingVersion ?? 'sw-refresh';
    if (!canAutoReloadForVersion(versionTag)) {
      setStatus('up-to-date');
      return;
    }

    reloadingRef.current = true;
    markReloadForVersion(versionTag);
    setStatus('updating');

    try {
      await clearStaleCaches();
      if (swRegistration) {
        await swRegistration.update().catch(() => undefined);
      }
      if (swApplyFn) {
        await swApplyFn(false).catch(() => undefined);
      }
    } catch {
      // proceed to reload cleanly
    }

    // Brief visual confirmation before refreshing to the new build
    window.setTimeout(() => {
      window.location.reload();
    }, 850);
  }, [pendingVersion]);

  const handleObservedVersion = useCallback(
    (observedVersion: string) => {
      if (!observedVersion) return;

      if (!bootVersionRef.current) {
        bootVersionRef.current = observedVersion;
        setCurrentVersion(observedVersion);
        return;
      }

      if (observedVersion !== bootVersionRef.current) {
        setPendingVersion(observedVersion);
        if (deferReloadRef.current) {
          setStatus('ready');
        } else {
          void applyUpdate(observedVersion);
        }
      }
    },
    [applyUpdate]
  );

  const checkForUpdate = useCallback(
    async (manual = false): Promise<boolean> => {
      if (reloadingRef.current) return false;
      if (manual) setStatus('checking');

      if (swRegistration) {
        void swRegistration.update().catch(() => undefined);
      }

      try {
        const res = await fetch(`/api/version?_t=${Date.now()}`, {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache' },
        });
        if (!res.ok) {
          if (manual) setStatus('idle');
          return false;
        }
        const data = (await res.json()) as { version?: string };
        const nextVer = typeof data.version === 'string' ? data.version : '';
        if (!nextVer) {
          if (manual) setStatus('idle');
          return false;
        }

        if (!bootVersionRef.current) {
          bootVersionRef.current = nextVer;
          setCurrentVersion(nextVer);
          if (manual) {
            setStatus('up-to-date');
            window.setTimeout(() => setStatus((s) => (s === 'up-to-date' ? 'idle' : s)), 2600);
          }
          return false;
        }

        if (nextVer !== bootVersionRef.current) {
          setPendingVersion(nextVer);
          if (deferReloadRef.current && !manual) {
            setStatus('ready');
          } else {
            void applyUpdate(nextVer);
          }
          return true;
        }

        if (manual) {
          setStatus('up-to-date');
          window.setTimeout(() => setStatus((s) => (s === 'up-to-date' ? 'idle' : s)), 2600);
        }
        return false;
      } catch {
        if (manual) setStatus('idle');
        return false;
      }
    },
    [applyUpdate]
  );

  // React to live WebSocket server version pushes immediately
  useEffect(() => {
    if (serverVersion) {
      handleObservedVersion(serverVersion);
    }
  }, [serverVersion, handleObservedVersion]);

  // If an update arrived mid-race, automatically apply once the player finishes or exits the race
  useEffect(() => {
    if (!deferReload && status === 'ready' && pendingVersion) {
      void applyUpdate(pendingVersion);
    }
  }, [deferReload, status, pendingVersion, applyUpdate]);

  // Initialize Service Worker + foreground/focus/online/interval checks
  useEffect(() => {
    initServiceWorkerBridge();

    const onSwRefresh = () => {
      if (deferReloadRef.current) {
        setStatus('ready');
      } else {
        void applyUpdate('sw-refresh');
      }
    };
    swNeedRefreshListeners.add(onSwRefresh);

    // Reload cleanly if a newly activated Service Worker claims this installed PWA window
    let hadController = Boolean(navigator.serviceWorker?.controller);
    const onControllerChange = () => {
      if (!hadController) {
        hadController = true;
        return;
      }
      if (!deferReloadRef.current && !reloadingRef.current) {
        void applyUpdate('sw-controller');
      } else {
        setStatus('ready');
      }
    };
    navigator.serviceWorker?.addEventListener('controllerchange', onControllerChange);

    // Initial boot version fetch
    void checkForUpdate(false);

    // Re-check whenever installed mobile PWA returns to foreground, gains focus, or reconnects online
    const onResume = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        void checkForUpdate(false);
      }
    };
    const onOnline = () => {
      void checkForUpdate(false);
    };

    document.addEventListener('visibilitychange', onResume);
    window.addEventListener('focus', onResume);
    window.addEventListener('online', onOnline);

    // Periodic background safety poll (every 30s while app is open & visible)
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        void checkForUpdate(false);
      }
    }, 30000);

    return () => {
      swNeedRefreshListeners.delete(onSwRefresh);
      navigator.serviceWorker?.removeEventListener('controllerchange', onControllerChange);
      document.removeEventListener('visibilitychange', onResume);
      window.removeEventListener('focus', onResume);
      window.removeEventListener('online', onOnline);
      window.clearInterval(intervalId);
    };
  }, [applyUpdate, checkForUpdate]);

  return {
    updateStatus: status,
    currentVersion,
    checkForUpdate,
    applyUpdate,
  };
}
