import { useEffect, useState } from 'react';

/**
 * Aktuelle Uhrzeit, die sich jede Minute (und beim Zurückkehren in den Tab) erneuert –
 * so wechselt z. B. die Begrüßung von „Guten Morgen“ zu „Guten Tag“ ohne Neuladen.
 */
export function useNow(intervalMs = 60000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const update = () => setNow(new Date());
    const timer = setInterval(update, intervalMs);
    const onVisible = () => document.visibilityState === 'visible' && update();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [intervalMs]);
  return now;
}
