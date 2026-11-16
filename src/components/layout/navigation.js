// Die sechs Hauptbereiche (Struktur aus der Codex-Version von Kerem, plus „Chatroom“) – gemeinsam genutzt
// von der Bottom-Navigation (Smartphone/Tablet) und der Kopfleiste (Desktop).
//
// Bestehende Routen bleiben erhalten (Links, Lesezeichen, E-Mail-Rücksprünge):
// /events und /ideas gehören jetzt zum Bereich „Entdecken“ (/network wurde entfernt und leitet auf /discover um).
export const NAV_ITEMS = [
  { id: 'home', to: '/', labelKey: 'nav.home', icon: 'home' },
  { id: 'discover', to: '/discover', labelKey: 'nav.discover', icon: 'search' },
  { id: 'tutoring', to: '/tutoring', labelKey: 'nav.tutoring', icon: 'lightbulb' },
  { id: 'community', to: '/community', labelKey: 'nav.community', icon: 'users' },
  // Eigener Bereich für den Chatroom (Gruppenräume, private Chats, Nachrichtenanfragen – alles unter /chat)
  { id: 'chat', to: '/chat', labelKey: 'nav.chat', icon: 'chat' },
  { id: 'me', to: '/me', labelKey: 'nav.me', icon: 'user' },
];

const SECTION_PREFIXES = [
  ['discover', ['/discover', '/events', '/ideas']],
  ['tutoring', ['/tutoring']],
  // Spiele liegen unter /community/games; /games ist nur noch eine Weiterleitung dorthin (App.jsx)
  ['community', ['/community', '/games']],
  ['chat', ['/chat']],
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

/** BrowserRouter setzt idx beim Einstieg auf 0 und erhöht ihn ausschließlich bei PUSH. */
export function hasAppHistory(state) {
  return Number.isInteger(state?.idx) && state.idx > 0;
}

/** Elternübersicht für Direktlinks. Hauptbereiche brauchen keinen zusätzlichen Rückweg. */
export function backFallbackForPath(pathname = '/') {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (NAV_ITEMS.some((item) => item.to === path)) return null;
  if (matchesPrefix(path, '/community/games') && path !== '/community/games') return '/community/games';
  if (matchesPrefix(path, '/community/people') && path !== '/community/people') return '/community/people';
  if (matchesPrefix(path, '/community')) return '/community';
  if (path === '/events' || path === '/ideas') return '/discover';
  if (matchesPrefix(path, '/events')) return '/events';
  if (matchesPrefix(path, '/ideas')) return '/ideas';
  if (matchesPrefix(path, '/tutoring')) return '/tutoring';
  if (matchesPrefix(path, '/chat/conversations')) return '/chat?tab=private';
  if (matchesPrefix(path, '/chat')) return '/chat';
  if (matchesPrefix(path, '/admin/events') && path !== '/admin/events') return '/admin/events';
  if (path === '/admin') return '/me';
  if (matchesPrefix(path, '/admin')) return '/admin';
  if (path === '/forgot-password' || path === '/reset-password') return '/login';
  if (matchesPrefix(path, '/me') || ['/login', '/register', '/about'].includes(path)) return '/me';
  return '/';
}
