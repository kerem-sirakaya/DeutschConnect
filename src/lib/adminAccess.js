/**
 * Reine Entscheidungs-Logik für den Admin-Bereich (ohne React, deshalb testbar:
 * tests/adminAccess.test.js).
 *
 * WICHTIG: Das ist nur die Anzeige-Logik. Die echte Sicherheitsgrenze sind die
 * Datenbank-Funktionen admin_*() – sie prüfen is_admin() selbst und lehnen alle
 * anderen mit 42501 ab, egal was der Browser anzeigt.
 */

/**
 * Admin-Status aus dem letzten Ergebnis von is_admin() ableiten.
 * @param {string|null} userId  ID des ECHTEN Kontos (null = Demo / abgemeldet / lädt noch)
 * @param {{ userId: string|null, isAdmin: boolean, error: unknown }} result  letztes Ergebnis
 * @returns {{ status: 'none'|'loading'|'error'|'ready', isAdmin: boolean }}
 */
export function deriveAdminStatus(userId, result) {
  if (!userId) return { status: 'none', isAdmin: false };
  // Ergebnis gehört zu einem anderen (früheren) Konto -> neu prüfen, bis dahin "lädt"
  if (!result || result.userId !== userId) return { status: 'loading', isAdmin: false };
  if (result.error) return { status: 'error', isAdmin: false };
  return { status: 'ready', isAdmin: result.isAdmin === true };
}

/**
 * Was soll die Admin-Route zeigen?
 * @param {{ isAuthenticated: boolean, adminStatus: string, isAdmin: boolean }} input
 * @returns {'login'|'loading'|'error'|'denied'|'allowed'}
 */
export function resolveAdminAccess({ isAuthenticated, adminStatus, isAdmin }) {
  if (!isAuthenticated) return 'login';
  if (adminStatus === 'error') return 'error';
  if (adminStatus !== 'ready') return 'loading';
  return isAdmin === true ? 'allowed' : 'denied';
}
