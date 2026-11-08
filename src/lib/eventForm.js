/**
 * Event-Formular für Admins: Umwandlung, Zeitzone und Prüfung – ohne React, deshalb
 * testbar (tests/eventForm.test.js).
 *
 * Die Prüfung hier ist nur eine HILFE für verständliche Fehlermeldungen. Die Datenbank
 * (admin_assert_event_input, Migration 006) prüft alles noch einmal und ist maßgeblich.
 */
import { TOPICS, EVENT_FORMATS } from '../data/topics.js';

/** Sprachen für mehrsprachige Texte (wie in der Datenbank erlaubt). */
export const LANGUAGES = ['de', 'tr', 'en'];

/** Höchstlängen je Sprache – gleiche Werte wie admin_assert_event_input (Migration 006). */
export const EVENT_TEXT_LIMITS = { title: 120, summary: 300, description: 2000, location: 200, audience: 200 };
export const EVENT_TEXT_FIELDS = Object.keys(EVENT_TEXT_LIMITS);
export const EVENT_NUMBER_LIMITS = {
  durationMinutes: { min: 1, max: 1440 },
  capacity: { min: 1, max: 10000 },
};
export const EVENT_TOPICS_MAX = 10;

// ---------------------------------------------------------------------------
// Zeitzone
// ---------------------------------------------------------------------------

/**
 * Alle Events finden in Ankara statt. Die Türkei nutzt seit 2016 dauerhaft UTC+3
 * (keine Sommerzeit). Deshalb gilt im Formular IMMER Ankara-Zeit – unabhängig davon,
 * in welcher Zeitzone der Browser oder der Server läuft.
 */
export const EVENT_TIME_ZONE = 'Europe/Istanbul';
export const ANKARA_UTC_OFFSET = '+03:00';
const ANKARA_OFFSET_MS = 3 * 60 * 60 * 1000;
const LOCAL_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** Ist "YYYY-MM-DDTHH:mm" ein echtes Datum (kein 31. Februar, keine 25 Uhr)? */
export function isValidLocalDateTime(value) {
  const match = typeof value === 'string' ? LOCAL_PATTERN.exec(value) : null;
  if (!match) return false;
  const [, y, mo, d, h, mi] = match.map(Number);
  const date = new Date(Date.UTC(y, mo - 1, d, h, mi));
  return (
    date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d &&
    date.getUTCHours() === h && date.getUTCMinutes() === mi
  );
}

/** "2026-12-01T14:00" (Ankara) -> "2026-12-01T14:00:00+03:00" oder null, wenn ungültig. */
export function ankaraLocalToIso(value) {
  return isValidLocalDateTime(value) ? `${value}:00${ANKARA_UTC_OFFSET}` : null;
}

/** Beliebiger ISO-Zeitpunkt (z. B. "2026-12-01T11:00:00+00:00") -> "2026-12-01T14:00" (Ankara). */
export function isoToAnkaraLocal(iso) {
  if (!iso) return '';
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return '';
  return new Date(time + ANKARA_OFFSET_MS).toISOString().slice(0, 16);
}

/** Anzeige eines Zeitpunkts IMMER in Ankara-Zeit, z. B. "Di., 1. Dez. 2026, 14:00". */
export function formatAnkaraDateTime(iso, locale) {
  if (!iso || Number.isNaN(new Date(iso).getTime())) return '';
  return new Intl.DateTimeFormat(locale, {
    timeZone: EVENT_TIME_ZONE,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

// ---------------------------------------------------------------------------
// Mehrsprachige Texte
// ---------------------------------------------------------------------------

/** Datenbank-Text (String, Objekt oder leer) -> { de, tr, en } für das Formular. */
export function toFormText(value) {
  if (typeof value === 'string') return { de: value, tr: '', en: '' };
  return Object.fromEntries(LANGUAGES.map((lang) => [lang, typeof value?.[lang] === 'string' ? value[lang] : '']));
}

/**
 * Formular-Text -> Wert zum Speichern.
 * War der ursprüngliche Wert ein einfacher String und wurde nur Deutsch ausgefüllt,
 * bleibt er ein String (die Form der vorhandenen Daten wird nicht still verändert).
 * Leere Sprachen werden in adminApi.cleanText ohnehin entfernt.
 */
export function fromFormText(formText, original) {
  const filled = LANGUAGES.filter((lang) => formText[lang].trim());
  if (filled.length === 0) return null;
  if (typeof original === 'string' && filled.length === 1 && filled[0] === 'de') return formText.de;
  return Object.fromEntries(filled.map((lang) => [lang, formText[lang]]));
}

// ---------------------------------------------------------------------------
// Formular <-> Event
// ---------------------------------------------------------------------------

const emptyText = () => ({ de: '', tr: '', en: '' });

/** Leeres Formular für ein neues Event. */
export function emptyEventForm(defaults = {}) {
  return {
    title: emptyText(),
    summary: emptyText(),
    description: emptyText(),
    location: emptyText(),
    audience: emptyText(),
    startLocal: '',
    durationMinutes: '',
    capacity: '',
    online: false,
    topics: [],
    format: 'meetup',
    hostSchoolId: defaults.hostSchoolId ?? '',
    schoolIds: defaults.schoolIds ?? [],
  };
}

/** Vorhandenes Event (aus fetchAdminEvents) -> Formular. ALLE Felder werden übernommen. */
export function eventToForm(event) {
  return {
    title: toFormText(event.title),
    summary: toFormText(event.summary),
    description: toFormText(event.description),
    location: toFormText(event.location),
    audience: toFormText(event.audience),
    startLocal: isoToAnkaraLocal(event.start),
    durationMinutes: event.durationMinutes == null ? '' : String(event.durationMinutes),
    capacity: event.capacity == null ? '' : String(event.capacity),
    online: Boolean(event.online),
    topics: [...(event.topics ?? [])],
    format: event.format ?? 'meetup',
    hostSchoolId: event.hostSchoolId ?? '',
    schoolIds: [...(event.schoolIds ?? [])],
  };
}

const toNumber = (value) => (String(value).trim() === '' ? null : Number(value));

/**
 * Formular -> vollständiges Event für createAdminEvent / updateAdminEvent.
 * `original` = bisheriges Event beim Bearbeiten (für die Form der Texte und ein
 * unverändertes Datum, damit keine Sekunden verloren gehen).
 */
export function formToEventInput(form, original = null) {
  const unchangedStart = original && isoToAnkaraLocal(original.start) === form.startLocal;
  return {
    title: fromFormText(form.title, original?.title),
    summary: fromFormText(form.summary, original?.summary),
    description: fromFormText(form.description, original?.description),
    location: fromFormText(form.location, original?.location),
    audience: fromFormText(form.audience, original?.audience),
    start: unchangedStart ? original.start : ankaraLocalToIso(form.startLocal),
    durationMinutes: toNumber(form.durationMinutes),
    capacity: toNumber(form.capacity),
    online: Boolean(form.online),
    topics: [...form.topics],
    format: form.format,
    hostSchoolId: form.hostSchoolId,
    schoolIds: [...form.schoolIds],
  };
}

// ---------------------------------------------------------------------------
// Prüfung
// ---------------------------------------------------------------------------

/** Ist das Datum fest? (abgesagt/abgeschlossen – Datenbank-Regel DC006) */
export function isEventDateLocked(status) {
  return status === 'cancelled' || status === 'completed';
}

function checkNumber(value, { min, max }, minFromData = min) {
  if (String(value).trim() === '') return null;
  const number = Number(value);
  if (!Number.isInteger(number)) return 'integer';
  if (number < min || number > max) return 'range';
  if (number < minFromData) return 'belowRegistrations';
  return null;
}

/**
 * Prüft das Formular. Gibt { feld: übersetzungsschlüssel } zurück (leer = alles ok).
 * @param {object} form
 * @param {{ allowedSchoolIds: string[], original?: object|null, now?: Date }} context
 */
export function validateEventForm(form, { allowedSchoolIds, original = null, now = new Date() }) {
  const errors = {};

  // Texte: Titel in mindestens einer Sprache, alle Texte nicht zu lang
  if (!LANGUAGES.some((lang) => form.title[lang].trim())) errors.title = 'admin.eventForm.errors.titleRequired';
  for (const field of EVENT_TEXT_FIELDS) {
    if (LANGUAGES.some((lang) => form[field][lang].trim().length > EVENT_TEXT_LIMITS[field])) {
      errors[field] = 'admin.eventForm.errors.tooLong';
    }
  }

  // Datum: Pflicht, gültig, in der Zukunft (außer unverändert beim Bearbeiten)
  const unchangedStart = original && isoToAnkaraLocal(original.start) === form.startLocal;
  if (!form.startLocal) errors.startLocal = 'admin.eventForm.errors.startRequired';
  else if (!isValidLocalDateTime(form.startLocal)) errors.startLocal = 'admin.eventForm.errors.startInvalid';
  else if (!unchangedStart && new Date(ankaraLocalToIso(form.startLocal)) <= now) {
    errors.startLocal = 'admin.eventForm.errors.startPast';
  }

  // Dauer und Plätze
  const durationError = checkNumber(form.durationMinutes, EVENT_NUMBER_LIMITS.durationMinutes);
  if (durationError) errors.durationMinutes = 'admin.eventForm.errors.duration';
  const registered = original?.registeredCount ?? 0;
  const capacityError = checkNumber(form.capacity, EVENT_NUMBER_LIMITS.capacity, Math.max(1, registered));
  if (capacityError === 'belowRegistrations') errors.capacity = 'admin.eventForm.errors.capacityBelowRegistrations';
  else if (capacityError) errors.capacity = 'admin.eventForm.errors.capacity';

  // Schulen
  const ids = form.schoolIds;
  if (ids.length === 0) errors.schoolIds = 'admin.eventForm.errors.schoolsRequired';
  else if (new Set(ids).size !== ids.length || ids.some((id) => !allowedSchoolIds.includes(id))) {
    errors.schoolIds = 'admin.eventForm.errors.schoolsInvalid';
  }
  if (!form.hostSchoolId) errors.hostSchoolId = 'admin.eventForm.errors.hostRequired';
  else if (!ids.includes(form.hostSchoolId)) errors.hostSchoolId = 'admin.eventForm.errors.hostNotParticipating';

  // Themen und Format
  if (form.topics.length > EVENT_TOPICS_MAX || form.topics.some((topic) => !TOPICS.includes(topic))) {
    errors.topics = 'admin.eventForm.errors.topics';
  }
  if (!EVENT_FORMATS.includes(form.format)) errors.format = 'admin.eventForm.errors.format';

  return errors;
}
