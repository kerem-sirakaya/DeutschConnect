// Prüft das Admin-Event-Formular: Zeitzone, Umwandlung, vollständige Felder, Prüfregeln.
// Ausführen mit: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { toEventParams } from '../src/lib/adminApi.js';
import {
  ankaraLocalToIso,
  emptyEventForm,
  eventToForm,
  formToEventInput,
  formatAnkaraDateTime,
  fromFormText,
  isEventDateLocked,
  isValidLocalDateTime,
  isoToAnkaraLocal,
  toFormText,
  validateEventForm,
} from '../src/lib/eventForm.js';

const NOW = new Date('2026-11-08T09:00:00Z'); // 12:00 in Ankara
const SCHOOLS = ['ers', 'anka'];
const ctx = (extra = {}) => ({ allowedSchoolIds: SCHOOLS, now: NOW, ...extra });

/** Event wie aus fetchAdminEvents (mapAdminEvent) */
const existing = {
  id: 'uuid-e1',
  title: { de: 'Sprachcafé', tr: 'Dil Kafesi', en: 'Language Café' },
  summary: 'Plaudern auf Deutsch', // alter Wert als einfacher String
  description: { de: 'Lange Beschreibung' },
  location: 'ERS, Bibliothek',
  audience: { de: 'Klassen 9–12', en: 'Grades 9–12' },
  start: '2026-12-01T11:00:00+00:00', // = 14:00 Ankara
  durationMinutes: 90,
  capacity: 30,
  online: false,
  topics: ['languages', 'culture'],
  format: 'meetup',
  hostSchoolId: 'ers',
  schoolIds: ['ers', 'anka'],
  status: 'planned',
  registeredCount: 12,
  interestedCount: 4,
};

const validNewForm = () => ({
  ...emptyEventForm({ schoolIds: ['ers', 'anka'] }),
  title: { de: 'Robotik-Workshop', tr: '', en: '' },
  startLocal: '2026-12-10T15:30',
  hostSchoolId: 'anka',
});

// ---------------------------------------------------------------------------
// Zeitzone
// ---------------------------------------------------------------------------

test('Ankara-Ortszeit wird zu ISO mit +03:00 (unabhängig von der Browser-Zeitzone)', () => {
  assert.equal(ankaraLocalToIso('2026-12-01T14:00'), '2026-12-01T14:00:00+03:00');
  // Gleicher Zeitpunkt in UTC: 11:00
  assert.equal(new Date(ankaraLocalToIso('2026-12-01T14:00')).toISOString(), '2026-12-01T11:00:00.000Z');
  // Kurz nach Mitternacht in Ankara = Vortag in UTC
  assert.equal(new Date(ankaraLocalToIso('2027-01-01T01:30')).toISOString(), '2026-12-31T22:30:00.000Z');
});

test('ISO aus der Datenbank wird als Ankara-Ortszeit angezeigt', () => {
  assert.equal(isoToAnkaraLocal('2026-12-01T11:00:00+00:00'), '2026-12-01T14:00');
  assert.equal(isoToAnkaraLocal('2026-12-31T22:30:00Z'), '2027-01-01T01:30');
  assert.equal(isoToAnkaraLocal('2026-12-01T14:00:00+03:00'), '2026-12-01T14:00');
  assert.equal(isoToAnkaraLocal(''), '');
  assert.equal(isoToAnkaraLocal('kein Datum'), '');
});

test('Hin- und Rückweg ergeben dieselbe Ortszeit', () => {
  for (const local of ['2026-03-29T03:00', '2026-10-25T02:30', '2028-02-29T23:59']) {
    assert.equal(isoToAnkaraLocal(ankaraLocalToIso(local)), local);
  }
});

test('ungültige Datumsangaben werden erkannt', () => {
  for (const value of ['', '2026-02-30T10:00', '2026-13-01T10:00', '2026-12-01T24:00', '2026-12-01', '01.12.2026 14:00', null]) {
    assert.equal(isValidLocalDateTime(value), false, String(value));
    assert.equal(ankaraLocalToIso(value), null);
  }
  assert.equal(isValidLocalDateTime('2028-02-29T10:00'), true); // Schaltjahr
});

test('Anzeige erfolgt in Ankara-Zeit', () => {
  const text = formatAnkaraDateTime('2026-12-01T11:00:00Z', 'de-DE');
  assert.match(text, /14:00/);
  assert.equal(formatAnkaraDateTime(null, 'de-DE'), '');
});

// ---------------------------------------------------------------------------
// Mehrsprachige Texte
// ---------------------------------------------------------------------------

test('Texte: String und Objekt werden ohne Verlust übernommen', () => {
  assert.deepEqual(toFormText('Hallo'), { de: 'Hallo', tr: '', en: '' });
  assert.deepEqual(toFormText({ de: 'A', en: 'B' }), { de: 'A', tr: '', en: 'B' });
  assert.deepEqual(toFormText(null), { de: '', tr: '', en: '' });
  // Alter String bleibt String, wenn nur Deutsch ausgefüllt ist
  assert.equal(fromFormText({ de: 'Hallo', tr: '', en: '' }, 'Hallo'), 'Hallo');
  // Wird eine Übersetzung ergänzt, entsteht ein Objekt
  assert.deepEqual(fromFormText({ de: 'Hallo', tr: 'Merhaba', en: '' }, 'Hallo'), { de: 'Hallo', tr: 'Merhaba' });
  assert.deepEqual(fromFormText({ de: 'A', tr: '', en: 'B' }, { de: 'A' }), { de: 'A', en: 'B' });
  assert.equal(fromFormText({ de: ' ', tr: '', en: '' }, null), null);
});

// ---------------------------------------------------------------------------
// Neues Event
// ---------------------------------------------------------------------------

test('neues Event: vollständige Eingabe mit Zeitzone, ohne Status', () => {
  const input = formToEventInput({ ...validNewForm(), capacity: '25', durationMinutes: '120', topics: ['technology'] });
  assert.deepEqual(input, {
    title: { de: 'Robotik-Workshop' },
    summary: null,
    description: null,
    location: null,
    audience: null,
    start: '2026-12-10T15:30:00+03:00',
    durationMinutes: 120,
    capacity: 25,
    online: false,
    topics: ['technology'],
    format: 'meetup',
    hostSchoolId: 'anka',
    schoolIds: ['ers', 'anka'],
  });
  assert.ok(!('status' in input));
  // Leere Zahlen werden null (= keine Begrenzung)
  assert.equal(formToEventInput(validNewForm()).capacity, null);
  assert.equal(formToEventInput(validNewForm()).durationMinutes, null);
});

test('neues Event: gültiges Formular hat keine Fehler', () => {
  assert.deepEqual(validateEventForm(validNewForm(), ctx()), {});
});

// ---------------------------------------------------------------------------
// Bearbeiten: ALLE Felder
// ---------------------------------------------------------------------------

test('Bearbeiten: unverändertes Formular schickt ALLE bisherigen Werte zurück', () => {
  const form = eventToForm(existing);
  assert.equal(form.startLocal, '2026-12-01T14:00');
  const input = formToEventInput(form, existing);
  assert.deepEqual(input, {
    title: existing.title,
    summary: existing.summary, // bleibt String
    description: existing.description,
    location: existing.location,
    audience: existing.audience,
    start: existing.start, // unverändert -> exakt der alte Wert
    durationMinutes: 90,
    capacity: 30,
    online: false,
    topics: ['languages', 'culture'],
    format: 'meetup',
    hostSchoolId: 'ers',
    schoolIds: ['ers', 'anka'],
  });
  // Und an die RPC gehen alle 13 Parameter
  assert.equal(Object.keys(toEventParams(input)).length, 13);
});

test('Bearbeiten: nur das Geänderte ändert sich, alles andere bleibt', () => {
  const form = { ...eventToForm(existing), capacity: '40', startLocal: '2026-12-02T10:00' };
  const input = formToEventInput(form, existing);
  assert.equal(input.capacity, 40);
  assert.equal(input.start, '2026-12-02T10:00:00+03:00');
  assert.deepEqual(input.title, existing.title);
  assert.deepEqual(input.audience, existing.audience);
  assert.deepEqual(input.topics, existing.topics);
});

test('Bearbeiten: Formular verändert das Original nicht', () => {
  const form = eventToForm(existing);
  form.topics.push('music');
  form.schoolIds.pop();
  assert.deepEqual(existing.topics, ['languages', 'culture']);
  assert.deepEqual(existing.schoolIds, ['ers', 'anka']);
});

// ---------------------------------------------------------------------------
// Prüfregeln
// ---------------------------------------------------------------------------

test('Pflichtfelder: Titel, Datum, Schulen, Gastgeber', () => {
  const errors = validateEventForm({ ...emptyEventForm(), schoolIds: [] }, ctx());
  assert.equal(errors.title, 'admin.eventForm.errors.titleRequired');
  assert.equal(errors.startLocal, 'admin.eventForm.errors.startRequired');
  assert.equal(errors.schoolIds, 'admin.eventForm.errors.schoolsRequired');
  assert.equal(errors.hostSchoolId, 'admin.eventForm.errors.hostRequired');
  // Titel nur aus Leerzeichen zählt nicht
  assert.equal(validateEventForm({ ...validNewForm(), title: { de: '  ', tr: '', en: '' } }, ctx()).title, 'admin.eventForm.errors.titleRequired');
});

test('Datum: ungültig und in der Vergangenheit', () => {
  assert.equal(validateEventForm({ ...validNewForm(), startLocal: '2026-02-30T10:00' }, ctx()).startLocal, 'admin.eventForm.errors.startInvalid');
  assert.equal(validateEventForm({ ...validNewForm(), startLocal: '2026-11-08T11:59' }, ctx()).startLocal, 'admin.eventForm.errors.startPast');
  assert.equal(validateEventForm({ ...validNewForm(), startLocal: '2026-11-08T12:01' }, ctx()).startLocal, undefined);
});

test('Datum: unverändertes (auch vergangenes) Datum beim Bearbeiten ist erlaubt', () => {
  const past = { ...existing, start: '2026-10-01T08:00:00Z', status: 'completed' };
  assert.equal(validateEventForm(eventToForm(past), ctx({ original: past })).startLocal, undefined);
  // Verschieben in die Vergangenheit nicht
  const moved = { ...eventToForm(existing), startLocal: '2026-11-01T10:00' };
  assert.equal(validateEventForm(moved, ctx({ original: existing })).startLocal, 'admin.eventForm.errors.startPast');
});

test('Datum gesperrt für abgesagte und abgeschlossene Events', () => {
  assert.equal(isEventDateLocked('cancelled'), true);
  assert.equal(isEventDateLocked('completed'), true);
  for (const status of ['draft', 'planned', 'confirmed']) assert.equal(isEventDateLocked(status), false);
});

test('Plätze: ganze Zahl 1–10000 und nicht unter der Zahl der Anmeldungen', () => {
  for (const capacity of ['0', '-5', '10001', '2.5', 'abc']) {
    assert.equal(validateEventForm({ ...validNewForm(), capacity }, ctx()).capacity, 'admin.eventForm.errors.capacity', capacity);
  }
  assert.equal(validateEventForm({ ...validNewForm(), capacity: '' }, ctx()).capacity, undefined);
  assert.equal(validateEventForm({ ...validNewForm(), capacity: '10000' }, ctx()).capacity, undefined);
  // 12 Anmeldungen vorhanden
  const form = eventToForm(existing);
  assert.equal(
    validateEventForm({ ...form, capacity: '11' }, ctx({ original: existing })).capacity,
    'admin.eventForm.errors.capacityBelowRegistrations',
  );
  assert.equal(validateEventForm({ ...form, capacity: '12' }, ctx({ original: existing })).capacity, undefined);
});

test('Kapazität: Eingabe wird als Zahl an p_capacity übergeben', () => {
  const input = formToEventInput({ ...validNewForm(), capacity: '25' });
  assert.equal(input.capacity, 25);
  assert.equal(toEventParams(input).p_capacity, 25);
  // Leerzeichen um die Zahl stören nicht
  assert.equal(formToEventInput({ ...validNewForm(), capacity: ' 40 ' }).capacity, 40);
});

test('Kapazität: leeres Feld = unbegrenzt (p_capacity = null)', () => {
  for (const capacity of ['', '   ']) {
    const input = formToEventInput({ ...validNewForm(), capacity });
    assert.equal(input.capacity, null);
    assert.equal(toEventParams(input).p_capacity, null);
    assert.equal(validateEventForm({ ...validNewForm(), capacity }, ctx()).capacity, undefined);
  }
});

test('Kapazität beim Bearbeiten: vorhandener Wert wird angezeigt und unverändert gespeichert', () => {
  assert.equal(eventToForm(existing).capacity, '30');
  assert.equal(formToEventInput(eventToForm(existing), existing).capacity, 30);
  // Unbegrenztes Event: leeres Feld, bleibt unbegrenzt
  const unlimited = { ...existing, capacity: null };
  assert.equal(eventToForm(unlimited).capacity, '');
  assert.equal(formToEventInput(eventToForm(unlimited), unlimited).capacity, null);
  // Begrenzung nachträglich entfernen
  assert.equal(formToEventInput({ ...eventToForm(existing), capacity: '' }, existing).capacity, null);
  // Begrenzung nachträglich setzen
  assert.equal(formToEventInput({ ...eventToForm(unlimited), capacity: '15' }, unlimited).capacity, 15);
});

test('Kapazität: unbegrenzt ist auch mit vorhandenen Anmeldungen erlaubt (keine DC005-Gefahr)', () => {
  const form = { ...eventToForm(existing), capacity: '' };
  assert.equal(validateEventForm(form, ctx({ original: existing })).capacity, undefined);
});

test('Dauer: ganze Zahl 1–1440', () => {
  for (const durationMinutes of ['0', '1441', '1.5', 'x']) {
    assert.equal(validateEventForm({ ...validNewForm(), durationMinutes }, ctx()).durationMinutes, 'admin.eventForm.errors.duration');
  }
  for (const durationMinutes of ['', '1', '1440']) {
    assert.equal(validateEventForm({ ...validNewForm(), durationMinutes }, ctx()).durationMinutes, undefined);
  }
});

test('Schulen: nur bekannte, keine doppelten, Gastgeber muss beteiligt sein', () => {
  assert.equal(validateEventForm({ ...validNewForm(), schoolIds: ['ers', 'fremd'] }, ctx()).schoolIds, 'admin.eventForm.errors.schoolsInvalid');
  assert.equal(validateEventForm({ ...validNewForm(), schoolIds: ['ers', 'ers'] }, ctx()).schoolIds, 'admin.eventForm.errors.schoolsInvalid');
  assert.equal(
    validateEventForm({ ...validNewForm(), schoolIds: ['ers'], hostSchoolId: 'anka' }, ctx()).hostSchoolId,
    'admin.eventForm.errors.hostNotParticipating',
  );
});

test('Texte zu lang, Themen und Format ungültig', () => {
  const errors = validateEventForm(
    {
      ...validNewForm(),
      title: { de: 'x'.repeat(121), tr: '', en: '' },
      location: { de: '', tr: 'y'.repeat(201), en: '' },
      topics: ['erfunden'],
      format: 'party',
    },
    ctx(),
  );
  assert.equal(errors.title, 'admin.eventForm.errors.tooLong');
  assert.equal(errors.location, 'admin.eventForm.errors.tooLong');
  assert.equal(errors.topics, 'admin.eventForm.errors.topics');
  assert.equal(errors.format, 'admin.eventForm.errors.format');
});

// ---------------------------------------------------------------------------
// Formular-Seite: Kapazitätsfeld (Schutz gegen Rückfall)
// ---------------------------------------------------------------------------

test('Formular-Seite: Kapazitätsfeld ist vorhanden, gebunden und steht bei Datum/Dauer', () => {
  const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
  const page = readFileSync(join(root, 'src', 'pages', 'admin', 'AdminEventFormPage.jsx'), 'utf8');
  // Eingabefeld mit Bindung an values.capacity und Änderung über update('capacity', …)
  assert.match(page, /id="event-capacity"[\s\S]*?type="number"/);
  assert.match(page, /value=\{values\.capacity\}/);
  assert.match(page, /update\('capacity', e\.target\.value\)/);
  // Nicht an eine Bedingung geknüpft (z. B. {isEdit && …})
  const block = page.slice(page.lastIndexOf('<div', page.indexOf('htmlFor="event-capacity"')), page.indexOf('id="event-capacity"'));
  assert.doesNotMatch(block, /&&\s*\(?\s*$/);
  // Reihenfolge: Dauer -> Kapazität -> Ort (nicht mehr ganz unten)
  const duration = page.indexOf('id="event-duration"');
  const capacity = page.indexOf('id="event-capacity"');
  const location = page.indexOf('name="location"');
  assert.ok(duration > 0 && capacity > duration && location > capacity, 'Kapazität steht direkt nach der Dauer');
});

test('Kapazitäts-Texte existieren in de, tr und en', () => {
  const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
  for (const lang of ['de', 'tr', 'en']) {
    const form = JSON.parse(readFileSync(join(root, 'src', 'locales', `${lang}.json`), 'utf8')).admin.eventForm;
    for (const key of ['capacityLabel', 'capacityHint', 'capacityPlaceholder', 'capacityHintRegistered_one', 'capacityHintRegistered_other']) {
      assert.equal(typeof form[key], 'string', `${lang}: ${key}`);
      assert.ok(form[key].trim().length > 0);
    }
  }
});
