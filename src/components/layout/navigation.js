// Die fünf Hauptbereiche (Struktur aus der Codex-Version von Kerem) – gemeinsam genutzt
// von der Bottom-Navigation (Smartphone/Tablet) und der Kopfleiste (Desktop).
//
// Bestehende Routen bleiben erhalten (Links, Lesezeichen, E-Mail-Rücksprünge):
// /events, /ideas und /network gehören jetzt zum Bereich „Entdecken“.
export const NAV_ITEMS = [
  { id: 'home', to: '/', labelKey: 'nav.home', icon: 'home' },
  { id: 'discover', to: '/discover', labelKey: 'nav.discover', icon: 'search' },
  { id: 'tutoring', to: '/tutoring', labelKey: 'nav.tutoring', icon: 'lightbulb' },
  { id: 'community', to: '/community', labelKey: 'nav.community', icon: 'users' },
  { id: 'me', to: '/me', labelKey: 'nav.me', icon: 'user' },
];

const SECTION_PREFIXES = [
  ['discover', ['/discover', '/events', '/ideas', '/network']],
  ['tutoring', ['/tutoring']],
  ['community', ['/community']],
  ['me', ['/me', '/about', '/login', '/register']],
];

const matchesPrefix = (pathname, prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`);

/**
 * Welcher Hauptbereich ist für eine URL aktiv? Damit weiß man immer, wo man ist –
 * auch auf Unterseiten wie /events/123 (→ „Entdecken“).
 * Gibt null zurück, wenn kein Bereich passt (z. B. /admin – eigener Bereich).
 */
export function sectionForPath(pathname = '/') {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  if (path === '/' || path === '') return 'home';
  for (const [id, prefixes] of SECTION_PREFIXES) {
    if (prefixes.some((prefix) => matchesPrefix(path, prefix))) return id;
  }
  return null;
}
