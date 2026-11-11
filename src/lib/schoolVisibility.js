/**
 * Inhalte ausgeblendeter Schulen (src/data/schools.js → HIDDEN_SCHOOL_IDS) NUR in der Anzeige weglassen.
 * Nichts wird gelöscht: Demo-Dateien, Datenbank-Zeilen, Anmeldungen und Verknüpfungen bleiben unverändert.
 *
 * Ausgeblendet wird ein Inhalt (Event, Idee, Nachhilfe-Eintrag, Profil), wenn
 *   - er von einer ausgeblendeten Schule stammt (hostSchoolId bzw. schoolId), oder
 *   - der Name einer ausgeblendeten Schule in einem Textfeld steht (TEXT_FIELDS).
 * Gemeinsame Inhalte (z. B. Event der ERS mit schoolIds ['ers', 'anka']) bleiben sichtbar –
 * dort fällt nur das Schul-Kennzeichen weg (getSchool liefert für ausgeblendete Schulen nichts).
 *
 * Ausnahmen für die EIGENEN Inhalte einer Person (eigene Ideen, Nachhilfe-Einträge, Anmeldungen) regeln
 * die Aufrufer (AppStateContext, TutoringContext) – nur für diese Person, nie öffentlich.
 * Freie Nutzertexte (Chat, Nachrichtenanfragen, Nachhilfe-Nachrichten, Notizen) werden bewusst NICHT gefiltert.
 */
import { HIDDEN_SCHOOL_IDS, getSchoolRecord, isHiddenSchool, schools } from '../data/schools.js';
import { demoProfiles } from '../data/profiles.js';

/** Textfelder, in denen nach dem Namen gesucht wird (Events, Ideen, Nachhilfe-Einträge). */
export const TEXT_FIELDS = ['title', 'summary', 'description', 'location', 'audience', 'subject', 'topics', 'availability'];

/**
 * Vergleichsform: Groß-/Kleinschreibung, Akzente und türkische i-Varianten (İ ı) zählen nicht.
 * Nötig, weil z. B. „BİLİM“ mit der normalen Groß/Klein-Regel von JavaScript nicht zu „bilim“ passt.
 */
const fold = (text) =>
  String(text)
    .replace(/İ/g, 'I')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Ein Muster je Schulname: Wortteile dürfen durch Leerzeichen, Bindestrich, Unterstrich getrennt oder
 * zusammengeschrieben sein („Muster Schule“ = „muster-schule“ = „MusterSchule“), aber der Name muss als
 * GANZES Wort stehen – kein Buchstabe/keine Ziffer direkt davor oder danach. So trifft ein kurzer Name wie
 * „ERS“ nicht „Anders“ oder „Personen“, und eine Stadt wie „Ankara“ trifft keinen längeren Schulnamen.
 * Erlaubt danach: Apostroph + türkische Endung („Muster Schule'de“).
 */
const namePattern = (name) => {
  const parts = fold(name).split(/[\s_-]+/).filter(Boolean).map(escapeRegExp);
  if (parts.length === 0) return null;
  return new RegExp(`(?<![\\p{L}\\p{N}])${parts.join('[\\s_-]*')}(?![\\p{L}\\p{N}])`, 'u');
};

const hiddenPatterns = [
  ...new Set(
    HIDDEN_SCHOOL_IDS.flatMap((id) => {
      const school = getSchoolRecord(id);
      return school ? [school.name, school.shortName] : [];
    }).filter(Boolean),
  ),
]
  .map(namePattern)
  .filter(Boolean);

/** Steht dieser Schulname (als ganzes Wort, siehe namePattern) im Text? – auch für Tests mit anderen Namen. */
export function matchesSchoolName(text, name) {
  const pattern = namePattern(name);
  return Boolean(pattern) && typeof text === 'string' && pattern.test(fold(text));
}

/** Alle Texte eines Feldes: einfacher Text, { de, tr, en } oder Liste. */
function textsOf(value) {
  if (value == null) return [];
  if (typeof value === 'string') return [value];
  if (typeof value === 'object') return Object.values(value).flatMap(textsOf);
  return [];
}

/** Steht der Name einer ausgeblendeten Schule (als ganzes Wort) in einem der Texte? */
export function mentionsHiddenSchool(...values) {
  if (hiddenPatterns.length === 0) return false;
  return values.flatMap(textsOf).some((text) => {
    const folded = fold(text);
    return hiddenPatterns.some((pattern) => pattern.test(folded));
  });
}

/** Darf der Inhalt öffentlich angezeigt werden? */
export function isVisibleContent(item) {
  if (!item) return false;
  if (isHiddenSchool(item.hostSchoolId) || isHiddenSchool(item.schoolId)) return false;
  return !mentionsHiddenSchool(...TEXT_FIELDS.map((field) => item[field]));
}

/** Liste ohne Inhalte ausgeblendeter Schulen. Verändert die übergebene Liste nicht. */
export const visibleContent = (list) => (Array.isArray(list) ? list.filter(isVisibleContent) : []);

/**
 * Wie visibleContent – aber EIGENE Inhalte der angemeldeten Person bleiben erhalten (eigene Idee,
 * eigener Nachhilfe-Eintrag, Event mit eigener Anmeldung). Sie werden mit ownOnly: true markiert:
 * öffentliche Listen (filterEvents, filterIdeas, Zähler) überspringen sie, „Meine …“, Detailseite und
 * Verwaltung zeigen sie. Andere Personen bekommen sie nie (die Ausnahme hängt an der eigenen ID/Anmeldung).
 */
export function visibleOrOwn(list, isOwn) {
  if (!Array.isArray(list)) return [];
  return list.flatMap((item) => {
    if (isVisibleContent(item)) return [item];
    return item && isOwn(item) ? [{ ...item, ownOnly: true }] : [];
  });
}

/** Für öffentliche Listen und Zähler: nur Inhalte ohne ownOnly. */
export const publicOnly = (list) => (Array.isArray(list) ? list.filter((item) => !item?.ownOnly) : []);

/**
 * Admin-Formular: alle sichtbaren Schulen + ausgeblendete Schulen NUR, wenn sie in existingIds stehen
 * (Gastgeber/beteiligte Schulen des bestehenden Events) – so bleibt ein bestehender Wert sichtbar und unverändert.
 * Reihenfolge wie in src/data/schools.js.
 */
export function schoolsIncludingExisting(existingIds) {
  const existing = new Set((existingIds ?? []).filter(Boolean));
  return schools.filter((school) => !isHiddenSchool(school.id) || existing.has(school.id));
}

/** Demo-Profile (Profilwechsel, Verzeichnis) ohne Personen ausgeblendeter Schulen. */
export const visibleDemoProfiles = demoProfiles.filter((profile) => !isHiddenSchool(profile.schoolId));

/** Gibt es dieses Demo-Profil UND ist seine Schule sichtbar? (getDemoProfile fällt bei unbekannter ID auf das erste zurück) */
export const isVisibleDemoProfile = (id) => {
  const profile = demoProfiles.find((p) => p.id === id);
  return Boolean(profile) && !isHiddenSchool(profile.schoolId);
};
