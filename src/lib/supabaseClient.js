import { createClient } from '@supabase/supabase-js';

/**
 * Supabase-Verbindung.
 *
 * Die Werte kommen aus .env.local (wird NICHT ins Git hochgeladen).
 * Der "publishable" Key darf im Browser stehen – die Sicherheit entsteht durch
 * Row Level Security in der Datenbank (supabase/migrations/001_initial_schema.sql).
 *
 * Fehlen die Werte, ist `supabase` = null und die App läuft nur im Demo-Modus.
 */
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Schutz vor einem Versehen: Ein geheimer Key darf NIE im Browser landen.
const looksSecret = typeof key === 'string' && (key.startsWith('sb_secret_') || key.includes('service_role'));
if (looksSecret) {
  console.error(
    'VITE_SUPABASE_PUBLISHABLE_KEY enthält einen GEHEIMEN Key. Bitte den "publishable" Key verwenden ' +
      'und den geheimen Key im Supabase-Dashboard neu erzeugen. Supabase wird deaktiviert.',
  );
}

export const isSupabaseConfigured = Boolean(url && key && !looksSecret);

export const supabase = isSupabaseConfigured ? createClient(url, key) : null;

/**
 * Prüft (nur zur Entwicklung), ob die Verbindung zu Supabase klappt.
 * Geprüft wird die PRIVATE Tabelle "profiles": Ohne Login ist "permission denied"
 * das ERWARTETE Ergebnis. Es beweist, dass URL + Key stimmen, die Tabellen
 * existieren und RLS Fremde aussperrt. ("schools" ist seit Migration 003 teilweise
 * öffentlich und eignet sich deshalb nicht mehr für diesen Test.)
 * Ändert nichts an der Oberfläche – Ausgabe nur in der Browser-Konsole.
 */
export async function checkSupabaseConnection() {
  if (!supabase) {
    console.info('[Supabase] Nicht konfiguriert – App läuft im Demo-Modus.');
    return 'not-configured';
  }
  const { error } = await supabase.from('profiles').select('id').limit(1);
  if (!error) {
    console.warn('[Supabase] Verbunden – ABER anonyme Besucher können "profiles" lesen. RLS/Grants prüfen!');
    return 'open';
  }
  if (error.code === '42501') {
    console.info('[Supabase] Verbunden ✓ Tabellen vorhanden, RLS blockiert anonyme Zugriffe (gewollt).');
    return 'ok';
  }
  if (error.code === 'PGRST205' || error.code === '42P01') {
    console.warn('[Supabase] Verbunden, aber Tabellen fehlen. supabase/migrations/*.sql im SQL Editor ausführen.');
    return 'missing-schema';
  }
  console.error('[Supabase] Verbindung fehlgeschlagen:', error.message);
  return 'error';
}
