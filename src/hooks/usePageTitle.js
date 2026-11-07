import { useEffect } from 'react';

/** Setzt den Titel im Browser-Tab (wichtig auch für Screenreader). */
export function usePageTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} · DeutschConnect` : 'DeutschConnect';
  }, [title]);
}
