import { useEffect, useState } from 'react';

/** `on`: the screen stays awake; `off`: the browser refused or let it go; `unsupported`: no API. */
export type WakeState = 'on' | 'off' | 'unsupported';

/**
 * Keep the screen awake while the calling component is mounted. Browsers drop the lock when the
 * page is hidden, so it is taken again each time the page comes back.
 */
export function useWakeLock(): WakeState {
  const [state, setState] = useState<WakeState>(() =>
    'wakeLock' in navigator ? 'off' : 'unsupported',
  );

  useEffect(() => {
    if (!('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let requesting = false;
    let done = false;

    const acquire = async () => {
      if (done || lock || requesting || document.visibilityState !== 'visible') return;
      requesting = true;
      try {
        const l = await navigator.wakeLock.request('screen');
        if (done) {
          void l.release();
          return;
        }
        lock = l;
        setState('on');
        l.addEventListener('release', () => {
          lock = null;
          if (!done) setState('off');
        });
      } catch {
        // Refused, e.g. by a battery saver or a page that isn't visible yet.
        setState('off');
      } finally {
        requesting = false;
      }
    };

    void acquire();
    const onVisible = () => void acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      done = true;
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release();
    };
  }, []);

  return state;
}
