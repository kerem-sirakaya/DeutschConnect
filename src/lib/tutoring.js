/**
 * Nachhilfe-Börse – reine Regeln (ohne React, ohne Supabase; getestet in tests/tutoring.test.js).
 *
 * Herkunft: Fachlogik aus der Codex-Version (src/data/modules.js: validTutoring,
 * filterTutoring, matching.js), angepasst an das Claude-Backend (Migration 011).
 * Die Grenzen hier sind IDENTISCH zu den Prüfregeln in supabase/migrations/011_tutoring.sql.
 * Die Datenbank prüft alles noch einmal – das Frontend zeigt nur früher eine Fehlermeldung.
 */
import { localize } from '../i18n/localize.js';
import { normalizeText } from './selectors.js';

export const TUTOR_KINDS = ['offer', 'request'];
export const TUTOR_FORMATS = ['online', 'school', 'either'];
export const TUTOR_LANGUAGES = ['de', 'tr', 'en'];
export const TUTORING_TABS = ['offers', 'requests', 'my', 'saved', 'contacts'];
export const REQUEST_STATUSES = ['pending', 'accepted', 'declined', 'withdrawn'];

/** Vorschläge im Formular (frei eintippen bleibt möglich). */
export const SUBJECT_SUGGESTIONS = ['math', 'german', 'english', 'turkish', 'physics', 'chemistry', 'biology', 'coding'];

export const TUTOR_LIMITS = {
  subject: [2, 80],
  topics: [3, 200],
  description: [20, 1000],
  availability: [3, 200],
  message: [10, 600],
  note: [0, 600],
};

/** Gleiche Regel wie public.dc_has_contact_data() in Migration 011. */
export function hasContactData(text) {
  const value = String(text ?? '');
  return (
    /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(value) ||
    /(https?:\/\/|www\.)/i.test(value) ||
    /(\d[\s/()-]*){9,}/.test(value)
  );
}

const lengthOk = (value, [min, max]) => {
  const trimmed = String(value ?? '').trim().length;
  return trimmed >= min && String(value ?? '').length <= max;
};

/** Gibt { feld: i18n-Schlüssel } zurück; leeres Objekt = gültig. */
export function validateTutoringEntry(values) {
  const errors = {};
  if (!TUTOR_KINDS.includes(values.kind)) errors.kind = 'tutoring.errors.kind';
  for (const field of ['subject', 'topics', 'description', 'availability']) {
    if (!lengthOk(values[field], TUTOR_LIMITS[field])) errors[field] = `tutoring.errors.${field}`;
    else if (hasContactData(values[field])) errors[field] = 'tutoring.errors.contactData';
  }
  if (!Array.isArray(values.languages) || values.languages.length === 0 || !values.languages.every((l) => TUTOR_LANGUAGES.includes(l))) {
    errors.languages = 'tutoring.errors.languages';
  }
  if (!TUTOR_FORMATS.includes(values.format)) errors.format = 'tutoring.errors.format';
  return errors;
}

export function validateRequestMessage(message) {
  if (!lengthOk(message, TUTOR_LIMITS.message)) return 'tutoring.errors.message';
  if (hasContactData(message)) return 'tutoring.errors.contactData';
  return null;
}

export function validateResponseNote(note) {
  if (!lengthOk(note ?? '', TUTOR_LIMITS.note)) return 'tutoring.errors.note';
  if (hasContactData(note)) return 'tutoring.errors.contactData';
  return null;
}

/** Fach vergleichbar machen: "Mathe", " mathematik " und "Matematik" → gleicher Schlüssel, wenn bekannt. */
const SUBJECT_ALIASES = {
  math: ['math', 'mathe', 'mathematik', 'matematik', 'mathematics', 'maths'],
  german: ['german', 'deutsch', 'almanca'],
  english: ['english', 'englisch', 'ingilizce'],
  turkish: ['turkish', 'turkisch', 'turkce', 'tuerkisch'],
  physics: ['physics', 'physik', 'fizik'],
  chemistry: ['chemistry', 'chemie', 'kimya'],
  biology: ['biology', 'biologie', 'biyoloji'],
  coding: ['coding', 'informatik', 'programmieren', 'bilisim', 'computer science', 'programming'],
};

export function normalizeSubject(subject) {
  const value = normalizeText(String(subject ?? '').trim()).replace(/\s+/g, ' ');
  for (const [key, aliases] of Object.entries(SUBJECT_ALIASES)) if (aliases.includes(value)) return key;
  return value;
}

/** Text eines Eintrags in der aktuellen Sprache (Demo-Einträge sind mehrsprachig, echte nicht). */
export function entryText(entry, field, language) {
  return localize(entry[field], language);
}

/**
 * Einträge für einen Tab filtern.
 * filters: { query, language, format, subject } – leer = alle
 */
export function filterTutoringEntries(entries, tab, filters = {}, language = 'de') {
  const { query = '', language: lang = '', format = '', subject = '' } = filters;
  const q = normalizeText(query.trim());
  return entries.filter((entry) => {
    if (tab === 'offers' && (entry.kind !== 'offer' || entry.isOwn || entry.status !== 'active')) return false;
    if (tab === 'requests' && (entry.kind !== 'request' || entry.isOwn || entry.status !== 'active')) return false;
    if (tab === 'my' && !entry.isOwn) return false;
    if (tab === 'saved' && !entry.isSaved) return false;
    if (lang && !entry.languages.includes(lang)) return false;
    if (format && entry.format !== format && entry.format !== 'either') return false;
    if (subject && normalizeSubject(entryText(entry, 'subject', language)) !== subject) return false;
    if (q) {
      const haystack = ['subject', 'topics', 'description'].map((field) => entryText(entry, field, language)).join(' ');
      if (!normalizeText(haystack).includes(q)) return false;
    }
    return true;
  });
}

/** Für den Fach-Filter: [schlüssel, Anzeigetext] ohne Doppelungen. */
export function subjectOptions(entries, language = 'de') {
  const map = new Map();
  for (const entry of entries) {
    const label = entryText(entry, 'subject', language).trim();
    const key = normalizeSubject(label);
    if (key && !map.has(key)) map.set(key, label);
  }
  return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], language));
}

/**
 * Passende Einträge für die Startseite (Idee aus Codex matching.js):
 * Zu jedem eigenen aktiven Eintrag passen fremde aktive Einträge der GEGENTEILIGEN Art
 * mit gleichem Fach und mindestens einer gemeinsamen Sprache.
 * Ohne Treffer: neueste fremde aktive Angebote (als „Entdecken“-Vorschlag).
 */
export function matchTutoring(entries, language = 'de') {
  const own = entries.filter((entry) => entry.isOwn && entry.status === 'active');
  const others = entries.filter((entry) => !entry.isOwn && entry.status === 'active');
  const matches = others.filter((other) =>
    own.some(
      (mine) =>
        mine.kind !== other.kind &&
        normalizeSubject(entryText(mine, 'subject', language)) === normalizeSubject(entryText(other, 'subject', language)) &&
        mine.languages.some((l) => other.languages.includes(l)),
    ),
  );
  if (matches.length) return { type: 'matches', entries: matches };
  return { type: 'discover', entries: others.filter((entry) => entry.kind === 'offer') };
}

/** Anfragen sortiert: offene zuerst, dann neueste. */
export function sortRequests(requests) {
  const rank = { pending: 0, accepted: 1, declined: 2, withdrawn: 3 };
  return [...requests].sort(
    (a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9) || new Date(b.createdAt) - new Date(a.createdAt),
  );
}

export function countOpenIncoming(requests) {
  return requests.filter((request) => request.direction === 'incoming' && request.status === 'pending').length;
}

/**
 * Wer steht hinter einer Anfrage? (Kopfzeile der RequestCard)
 * schoolShortName fehlt bei ausgeblendeten (src/data/schools.js) oder unbekannten Schulen –
 * dann ohne Schulteil, statt „Eine Person von –“ oder „Anna · “.
 */
export function requestPartnerLabel(firstName, schoolShortName, t) {
  if (firstName) return schoolShortName ? `${firstName} · ${schoolShortName}` : firstName;
  return schoolShortName ? t('tutoring.someoneFrom', { school: schoolShortName }) : t('tutoring.someone');
}

/** Datenbankzeile (tutoring_list_entries) → Objekt für die Oberfläche. */
export function mapEntryRow(row) {
  return {
    id: row.id,
    schoolId: row.school_id,
    kind: row.kind,
    subject: row.subject,
    topics: row.topics,
    description: row.description,
    availability: row.availability,
    languages: Array.isArray(row.languages) ? row.languages : [],
    format: row.format,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isOwn: Boolean(row.is_own),
    isSaved: Boolean(row.is_saved),
    myRequestStatus: row.my_request_status ?? null,
    incomingPending: Number(row.incoming_pending) || 0,
    isDemo: false,
  };
}

/** Datenbankzeile (tutoring_list_requests) → Objekt für die Oberfläche. */
export function mapRequestRow(row) {
  return {
    id: row.id,
    entryId: row.entry_id,
    direction: row.direction,
    entryKind: row.entry_kind,
    entrySubject: row.entry_subject,
    entryTopics: row.entry_topics,
    entryStatus: row.entry_status,
    otherFirstName: row.other_first_name ?? null,
    otherSchoolId: row.other_school_id ?? null,
    message: row.message,
    status: row.status,
    responseNote: row.response_note ?? null,
    createdAt: row.created_at,
    respondedAt: row.responded_at ?? null,
    // nur gesetzt, wenn der Vorname sichtbar ist (eingehend immer, ausgehend nach Annahme)
    otherProfileId: row.other_profile_id ?? null,
  };
}

/** Formularwerte → Spalten für insert/update (Status/Besitzer setzt die Datenbank bzw. RLS). */
export function entryToRow(values) {
  return {
    kind: values.kind,
    subject: values.subject.trim(),
    topics: values.topics.trim(),
    description: values.description.trim(),
    availability: values.availability.trim(),
    languages: [...new Set(values.languages)],
    format: values.format,
  };
}
