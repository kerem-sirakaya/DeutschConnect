// Prüft das Löschen von Ideen durch Admins (Frontend-Logik + Migration 007)
// mit einem NACHGEBAUTEN Supabase-Client. Keine echte Datenbank. Ausführen mit: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  IDEA_DELETABLE_STATUSES,
  IDEA_DELETE_ACTION,
  canDeleteIdea,
  countIdeasByStatus,
  loadAdminIdeas,
  moderateIdea,
  removeIdea,
  resolveIdeaConfirmation,
} from '../src/lib/adminIdeas.js';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

function fakeClient(responses = {}) {
  const calls = [];
  return {
    calls,
    async rpc(name, args) {
      calls.push({ name, args });
      return responses[name] ?? { data: null, error: null };
    },
    from(table) {
      throw new Error(`Direkter Tabellenzugriff auf "${table}" ist verboten`);
    },
  };
}

const row = (id, status, supporters = 0) => ({
  id,
  school_id: 'ers',
  title: `Idee ${id}`,
  summary: 'Kurz',
  description: 'Eine ausführliche Beschreibung der Idee.',
  topics: ['science'],
  format: 'workshop',
  school_ids: ['ers'],
  status,
  created_at: '2026-11-01T10:00:00+00:00',
  supporters,
});
const rows = [
  row('sub', 'submitted'),
  row('col', 'collecting', 3),
  row('rev', 'review', 1),
  row('pla', 'planned'),
  row('rej', 'rejected'),
];

async function loaded() {
  return (await loadAdminIdeas(fakeClient({ admin_list_ideas: { data: rows, error: null } }))).ideas;
}
const byId = (ideas, id) => ideas.find((idea) => idea.id === id);

// ---------------------------------------------------------------------------
// Was darf gelöscht werden?
// ---------------------------------------------------------------------------

test('löschbar: collecting, review, planned, rejected – nicht submitted', async () => {
  assert.deepEqual(IDEA_DELETABLE_STATUSES, ['collecting', 'review', 'planned', 'rejected']);
  const ideas = await loaded();
  for (const id of ['col', 'rev', 'pla', 'rej']) assert.equal(canDeleteIdea(byId(ideas, id)), true, id);
  assert.equal(canDeleteIdea(byId(ideas, 'sub')), false);
  assert.equal(canDeleteIdea({ status: 'unbekannt' }), false);
  assert.equal(canDeleteIdea(null), false);
});

// ---------------------------------------------------------------------------
// Löschen
// ---------------------------------------------------------------------------

test('freigegebene Ideen (collecting, review, planned) löschen über admin_delete_idea', async () => {
  for (const id of ['col', 'rev', 'pla']) {
    const ideas = await loaded();
    const client = fakeClient();
    const result = await removeIdea(client, ideas, id);
    assert.equal(result.errorKey, null, id);
    assert.deepEqual(client.calls, [{ name: 'admin_delete_idea', args: { p_id: id } }]);
    assert.ok(!byId(result.ideas, id), `${id} ist aus der Liste entfernt`);
    assert.equal(result.ideas.length, 4);
    assert.ok(byId(ideas, id), 'Original-Liste unverändert');
  }
});

test('abgelehnte Idee löschen', async () => {
  const client = fakeClient();
  const result = await removeIdea(client, await loaded(), 'rej');
  assert.equal(result.errorKey, null);
  assert.equal(client.calls[0].name, 'admin_delete_idea');
  assert.ok(!byId(result.ideas, 'rej'));
});

test('eingereichte Idee: KEINE Anfrage, Liste unverändert, verständlicher Fehler', async () => {
  const ideas = await loaded();
  const client = fakeClient();
  const result = await removeIdea(client, ideas, 'sub');
  assert.equal(result.errorKey, 'admin.errors.ideaNotDeletable');
  assert.equal(result.ideas, ideas);
  assert.equal(client.calls.length, 0);
});

test('unbekannte Idee: KEINE Anfrage', async () => {
  const client = fakeClient();
  const result = await removeIdea(client, await loaded(), 'gibt-es-nicht');
  assert.equal(result.errorKey, 'admin.errors.notFound');
  assert.equal(client.calls.length, 0);
});

test('Schüler:in (kein Admin) bekommt 42501 – Liste bleibt unverändert', async () => {
  const ideas = await loaded();
  const client = fakeClient({ admin_delete_idea: { data: null, error: { code: '42501', message: 'Nur für Admins.' } } });
  const result = await removeIdea(client, ideas, 'col');
  assert.equal(result.errorKey, 'admin.errors.notAllowed');
  assert.equal(result.ideas, ideas);
});

test('weitere Datenbank-Fehler werden übersetzt, Liste bleibt unverändert', async () => {
  const ideas = await loaded();
  for (const [error, key] of [
    [{ code: 'P0002' }, 'admin.errors.notFound'], // inzwischen von jemand anderem gelöscht
    [{ code: 'DC010' }, 'admin.errors.ideaNotDeletable'], // Status hat sich inzwischen geändert
    [{ code: '22023' }, 'admin.errors.invalid'],
    [{ code: 'PGRST202' }, 'admin.errors.unavailable'], // Migration 007 noch nicht ausgeführt
    [{ name: 'TypeError', message: 'Failed to fetch' }, 'admin.errors.network'],
    [{ code: 'XX000' }, 'admin.errors.generic'],
  ]) {
    const result = await removeIdea(fakeClient({ admin_delete_idea: { data: null, error } }), ideas, 'col');
    assert.equal(result.errorKey, key);
    assert.equal(result.ideas, ideas);
  }
});

test('Übersicht und Filter-Zahlen stimmen nach dem Löschen', async () => {
  const ideas = await loaded();
  assert.deepEqual(countIdeasByStatus(ideas), { all: 5, submitted: 1, collecting: 1, review: 1, planned: 1, rejected: 1 });
  const afterCol = (await removeIdea(fakeClient(), ideas, 'col')).ideas;
  assert.deepEqual(countIdeasByStatus(afterCol), { all: 4, submitted: 1, collecting: 0, review: 1, planned: 1, rejected: 1 });
  const afterRej = (await removeIdea(fakeClient(), afterCol, 'rej')).ideas;
  assert.deepEqual(countIdeasByStatus(afterRej), { all: 3, submitted: 1, collecting: 0, review: 1, planned: 1, rejected: 0 });
});

test('Moderations-Wechsel bleiben unverändert (z. B. submitted -> collecting)', async () => {
  const result = await moderateIdea(fakeClient(), await loaded(), 'sub', 'collecting');
  assert.equal(result.errorKey, null);
  assert.equal(result.action.id, 'approve');
});

// ---------------------------------------------------------------------------
// Bestätigen und Abbrechen
// ---------------------------------------------------------------------------

test('Bestätigung: "Löschen" öffnet die Lösch-Bestätigung nur für löschbare Ideen', async () => {
  const ideas = await loaded();
  assert.equal(resolveIdeaConfirmation(byId(ideas, 'col'), 'delete'), IDEA_DELETE_ACTION);
  assert.equal(resolveIdeaConfirmation(byId(ideas, 'rej'), 'delete'), IDEA_DELETE_ACTION);
  assert.equal(resolveIdeaConfirmation(byId(ideas, 'sub'), 'delete'), null);
  // Statuswechsel funktionieren wie bisher
  assert.equal(resolveIdeaConfirmation(byId(ideas, 'sub'), 'collecting').id, 'approve');
  assert.equal(resolveIdeaConfirmation(byId(ideas, 'sub'), 'planned'), null);
});

test('Abbrechen: ohne offene Bestätigung wird nichts angezeigt und nichts gesendet', async () => {
  for (const idea of await loaded()) assert.equal(resolveIdeaConfirmation(idea, null), null);
});

test('Lösch-Aktion ist rot (danger) und hat eigene Texte', () => {
  assert.equal(IDEA_DELETE_ACTION.tone, 'danger');
  assert.equal(IDEA_DELETE_ACTION.labelKey, 'admin.ideas.actions.delete');
  assert.equal(IDEA_DELETE_ACTION.confirmKey, 'admin.ideas.confirm.delete');
});

test('Seite: Schutz vor Doppelklick beim Bestätigen', () => {
  const page = readFileSync(join(root, 'src', 'pages', 'admin', 'AdminIdeasPage.jsx'), 'utf8');
  assert.match(page, /if \(busyRef\.current\) return;/);
  assert.match(page, /busyRef\.current = true;/);
  const card = readFileSync(join(root, 'src', 'components', 'admin', 'AdminIdeaCard.jsx'), 'utf8');
  assert.match(card, /disabled=\{pending\}/);
});

// ---------------------------------------------------------------------------
// Übersetzungen
// ---------------------------------------------------------------------------

test('Texte zum Löschen existieren in de, tr und en und nennen den Titel', () => {
  for (const lang of ['de', 'tr', 'en']) {
    const dict = JSON.parse(readFileSync(join(root, 'src', 'locales', `${lang}.json`), 'utf8'));
    const get = (key) => key.split('.').reduce((node, part) => node?.[part], dict);
    for (const key of ['admin.ideas.actions.delete', 'admin.ideas.confirm.delete', 'admin.ideas.deleted', 'admin.errors.ideaNotDeletable']) {
      assert.equal(typeof get(key), 'string', `${lang}: ${key}`);
      assert.ok(get(key).trim().length > 0);
    }
    assert.match(get('admin.ideas.confirm.delete'), /\{title\}/);
    assert.match(get('admin.ideas.deleted'), /\{title\}/);
  }
});

// ---------------------------------------------------------------------------
// Migration 007 (statisch – es wird KEIN SQL ausgeführt)
// ---------------------------------------------------------------------------

const sql = readFileSync(join(root, 'supabase', 'migrations', '007_admin_delete_idea.sql'), 'utf8');
const code = sql.replace(/--.*$/gm, ''); // Kommentare entfernen – nur echten SQL-Code prüfen
const fnBody = code.slice(
  code.indexOf('create or replace function public.admin_delete_idea'),
  code.indexOf('revoke all on function public.admin_delete_idea'),
);

test('Migration 007: sichere Funktion nach admin_*-Muster', () => {
  assert.match(fnBody, /security definer/);
  assert.ok(fnBody.includes("set search_path = ''"));
  assert.match(fnBody, /if not public\.is_admin\(\) then\s+raise exception '[^']*' using errcode = '42501'/);
  assert.ok(fnBody.indexOf('is_admin()') < fnBody.indexOf('delete from'), 'Admin-Prüfung vor jedem Löschen');
  assert.ok(code.includes('revoke all on function public.admin_delete_idea(uuid) from public, anon;'));
  assert.ok(code.includes('grant execute on function public.admin_delete_idea(uuid) to authenticated;'));
});

test('Migration 007: Erlaubnisliste ohne submitted, Sperre gegen gleichzeitige Änderungen', () => {
  assert.ok(fnBody.includes("old_status not in ('collecting', 'review', 'planned', 'rejected')"));
  assert.ok(fnBody.includes("errcode = 'DC010'"));
  assert.ok(fnBody.includes("errcode = 'P0002'"));
  assert.match(fnBody, /for update/);
});

test('Migration 007: Unterstützungen werden mitgelöscht (keine verwaisten Einträge)', () => {
  const supports = fnBody.indexOf('delete from public.idea_supports');
  const idea = fnBody.indexOf('delete from public.ideas');
  assert.ok(supports > 0 && idea > supports, 'erst idea_supports, dann ideas');
  assert.ok(fnBody.includes('delete from public.idea_supports s where s.idea_id = p_id'));
  // Selbstprüfung verlangt zusätzlich ON DELETE CASCADE
  assert.ok(code.includes("confdeltype = 'c'"));
});

test('Migration 007: keine neuen Tabellenrechte, keine Policies, transaktional', () => {
  assert.doesNotMatch(code, /create policy|alter policy|drop policy/i);
  assert.doesNotMatch(code, /grant\s+(select|insert|update|delete|all)[^;]*\bon\s+(table\s+)?public\./i);
  assert.doesNotMatch(code, /alter table/i);
  assert.match(code, /^begin;/m);
  assert.match(code, /^commit;/m);
});
