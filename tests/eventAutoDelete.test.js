// Automatisches Löschen von Events (Migration 018/019) – Frontend-Regel + statische Prüfung der SQL-Dateien.
// Die echte Datenbank-Prüfung steht in supabase/tests/018_event_auto_delete_test.sql.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { eventDeletionDueAt, isDeletionDue, visibleToStudents, studentArchiveDueAt } from '../src/lib/eventArchive.js';

const at = (iso) => new Date(iso);
const ev = (id, status, start, extra = {}) => ({ id, status, start, durationMinutes: 60, ...extra });
const H = 60 * 60 * 1000;

test('Regel 2 – Beispiel: geplant Montag 16:00 -> gelöscht Dienstag 16:00 (Ankara)', () => {
  const e = ev('p', 'planned', '2026-11-16T16:00:00+03:00');
  assert.equal(eventDeletionDueAt(e), at('2026-11-17T16:00:00+03:00').getTime());
  assert.equal(isDeletionDue(e, at('2026-11-17T15:59:59+03:00')), false, '1 s vorher: bleibt');
  assert.equal(isDeletionDue(e, at('2026-11-17T16:00:00+03:00')), true, 'genau 24 h: fällig');
});

test('Regel 1 – Beispiel: abgesagt Montag 16:00 -> gelöscht Dienstag 16:00, Termin egal', () => {
  for (const start of ['2026-12-24T10:00:00+03:00', '2026-11-01T10:00:00+03:00']) {
    const e = ev('c', 'cancelled', start, { cancelledAt: '2026-11-16T13:00:00Z' }); // = 16:00 Ankara
    assert.equal(eventDeletionDueAt(e), at('2026-11-17T16:00:00+03:00').getTime(), start);
    assert.equal(isDeletionDue(e, at('2026-11-17T15:59:59+03:00')), false, start);
    assert.equal(isDeletionDue(e, at('2026-11-17T16:00:00+03:00')), true, start);
  }
});

test('Regel 2 gilt für planned, confirmed und completed – Dauer und Ende spielen keine Rolle', () => {
  for (const status of ['planned', 'confirmed', 'completed']) {
    for (const durationMinutes of [null, 30, 240, 3 * 24 * 60]) {
      const e = ev('x', status, '2026-11-16T16:00:00+03:00', { durationMinutes });
      assert.equal(eventDeletionDueAt(e), at('2026-11-16T16:00:00+03:00').getTime() + 24 * H, `${status}/${durationMinutes}`);
    }
  }
});

test('Entwürfe, unbekannter Status und fehlende Zeitstempel werden nie automatisch gelöscht', () => {
  assert.equal(eventDeletionDueAt(ev('d', 'draft', '2020-01-01T10:00:00Z')), null);
  assert.equal(eventDeletionDueAt(ev('u', 'unknown', '2020-01-01T10:00:00Z')), null);
  assert.equal(eventDeletionDueAt(ev('c', 'cancelled', '2020-01-01T10:00:00Z')), null, 'Absage ohne Zeitpunkt');
  assert.equal(eventDeletionDueAt(ev('p', 'planned', null)), null);
  assert.equal(eventDeletionDueAt(null), null);
});

test('Zeitzonen: gleicher Zeitpunkt in verschiedener Schreibweise -> gleiche Fälligkeit', () => {
  const forms = ['2026-11-16T16:00:00+03:00', '2026-11-16T13:00:00Z', '2026-11-16T14:00:00+01:00', '2026-11-16T05:00:00-08:00'];
  const dues = forms.map((start) => eventDeletionDueAt(ev('p', 'planned', start)));
  assert.ok(dues.every((d) => d === dues[0]), dues.join());
});

test('nie zu früh: für jede Startminute eines Tages gilt Fälligkeit = Start + exakt 24 h', () => {
  const base = at('2026-11-16T00:00:00+03:00').getTime();
  for (let m = 0; m < 24 * 60; m += 7) {
    const start = base + m * 60 * 1000;
    const e = ev('p', 'confirmed', new Date(start).toISOString());
    assert.equal(isDeletionDue(e, new Date(start + 24 * H - 1)), false);
    assert.equal(isDeletionDue(e, new Date(start + 24 * H)), true);
  }
});

test('Löschen ist nie später fällig als das Archivieren (009 wird überflüssig)', () => {
  const cases = [
    ev('a', 'planned', '2026-11-16T16:00:00+03:00', { durationMinutes: 180 }),
    ev('b', 'confirmed', '2026-11-16T23:30:00+03:00', { durationMinutes: null }),
    ev('c', 'cancelled', '2026-12-24T10:00:00+03:00', { cancelledAt: '2026-11-16T13:00:00Z' }),
    ev('d', 'cancelled', '2026-11-01T10:00:00+03:00', { cancelledAt: '2026-11-16T13:00:00Z' }),
  ];
  for (const e of cases) assert.ok(eventDeletionDueAt(e) <= studentArchiveDueAt(e), e.id);
});

test('visibleToStudents blendet ab der Löschfrist aus – auch abgesagte Events mit künftigem Termin', () => {
  const events = [
    ev('p', 'planned', '2026-11-16T16:00:00+03:00', { durationMinutes: 180 }),
    ev('c', 'cancelled', '2026-12-24T10:00:00+03:00', { cancelledAt: '2026-11-16T13:00:00Z' }),
    ev('f', 'confirmed', '2026-11-20T10:00:00+03:00'),
  ];
  const ids = (now) => visibleToStudents(events, at(now)).map((e) => e.id);
  assert.deepEqual(ids('2026-11-17T15:59:59+03:00'), ['p', 'c', 'f']);
  assert.deepEqual(ids('2026-11-17T16:00:00+03:00'), ['f']);
  assert.equal(events.length, 3, 'Liste wird nicht verändert');
});

// ---------- statische Prüfung der Migrationen ----------
const read = (name) => readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8');
const strip = (sql) => sql.replace(/--.*$/gm, '');
const m018 = strip(read('018_event_auto_delete.sql'));
const m019 = strip(read('019_event_auto_delete_cron.sql'));
const m014 = strip(read('014_chat.sql'));

test('018: Regeln in SQL wie im Frontend (Absage + 24 h, Start + 24 h, Entwurf nie)', () => {
  assert.match(m018, /when p_status = 'cancelled' then p_cancelled_at \+ interval '24 hours'/);
  assert.match(m018, /when p_status in \('planned', 'confirmed', 'completed'\) then p_start_at \+ interval '24 hours'/);
  assert.ok(!/interval '1 day'/.test(m018), "kein '1 day' (Sommerzeit)");
  assert.match(m018, /event_deletion_due_at\(e\.status, e\.start_at, e\.cancelled_at\) <= now\(\)/);
});

test('018: genau ein DELETE, nur für fällige Events, Chat-Gruppe wird vorher gelöst, Protokoll ohne Personendaten', () => {
  const deletes = [...m018.matchAll(/delete from public\.(\w+)/g)].map((m) => m[1]);
  assert.deepEqual(deletes, ['events']);
  assert.match(m018, /delete from public\.events e where e\.id = ev\.id/);
  assert.ok(m018.indexOf('chat_detach_event_room(ev.id)') < m018.indexOf('delete from public.events e where e.id = ev.id'));
  assert.match(m018, /for update of e skip locked/);
  assert.ok(!/user_id|first_name|email/i.test(m018.match(/create table if not exists public\.event_deletion_log \(([\s\S]*?)\);/)[1]));
  const fn = m018.match(/create or replace function public\.delete_expired_events\(\)[\s\S]*?\n\$\$;/)[0];
  assert.ok(!/drop table|truncate/i.test(fn), 'kein DROP/TRUNCATE in der Löschfunktion');
});

test('018: nur der Datenbank-Eigentümer darf löschen (auch nicht service_role); Selbstprüfung mit Probe', () => {
  assert.match(m018, /revoke all on function public\.delete_expired_events\(\) from public, anon, authenticated, service_role/);
  assert.match(m018, /revoke all on public\.event_deletion_log from public, anon, authenticated, service_role/);
  assert.match(m018, /raise exception using errcode = 'DC8PR'/);
  assert.match(m018, /planned 1 s ZU FRÜH gelöscht/);
});

test('019: pg_cron jede Minute, genau ein Job, alter Archiv-Job wird entfernt', () => {
  assert.match(m019, /'dc_delete_expired_events',\s*'\* \* \* \* \*',\s*'select public\.delete_expired_events\(\);'/);
  assert.match(m019, /where jobname in \('dc_delete_expired_events', 'dc_archive_finished_events'\)/);
  assert.match(m019, /username = fn_owner/);
});

test('014: Eventgruppe ohne Event nur archiviert; Mitglieder werden gesichert; Fremdschlüssel bleibt RESTRICT', () => {
  assert.match(m014, /kind = 'event'\s+and slug is null and idea_id is null and \(event_id is not null or archived_at is not null\)/);
  assert.match(m014, /references public\.events \(id\) on delete restrict/);
  const detach = m014.match(/create or replace function public\.chat_detach_event_room[\s\S]*?\n\$\$;/)[0];
  assert.match(detach, /insert into public\.chat_room_members/);
  assert.match(detach, /er\.status = 'registered'/);
  assert.match(detach, /event_id = null/);
  assert.ok(!/delete from/.test(detach), 'löscht nichts');
  assert.match(m014, /revoke execute on function public\.chat_detach_event_room\(uuid\) from public, anon, authenticated/);
});
