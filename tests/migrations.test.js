// Konsistenz der Migrationsdateien untereinander (ohne Datenbank). Ausführen mit: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const read = (name) =>
  readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const stripComments = (sql) => sql.split('\n').filter((line) => !line.trim().startsWith('--')).join('\n');
const norm = (text) => text.toLowerCase().replace(/\s+/g, ' ').replace(/\( /g, '(').replace(/ \)/g, ')').trim();

const m004 = stripComments(read('004_ideas_moderation.sql'));
const m006 = read('006_admin_events_ideas.sql');

test('004 im Repo ist v3: genau die Policies, die 006 erwartet', () => {
  const spec = JSON.parse(m006.match(/expected_policies jsonb := \$spec\$(\[[\s\S]*?\])\$spec\$/)[1]);
  const from004 = spec.filter((p) => ['ideas: lesen (freigegeben oder eigene)', 'supports: eigene anlegen'].includes(p.n));
  assert.equal(from004.length, 2);
  const body = norm(m004);
  for (const policy of from004) {
    assert.ok(body.includes(`create policy "${policy.n}"`), policy.n);
    const expr = norm(policy.u ?? policy.w);
    assert.ok(body.includes(expr), `${policy.n}: Ausdruck aus 006 fehlt in 004 → ${expr}`);
  }
  assert.ok(!/status <> 'submitted'/.test(m004), 'v1-Ausschlussliste darf nicht mehr vorkommen');
});

test('004 im Repo ist v3: get_idea_support_counts wie counts_body in 006', () => {
  const literal = m006.match(/counts_body constant text :=([\s\S]*?);\n/)[1];
  const expected = [...literal.matchAll(/'((?:[^']|'')*)'/g)].map((m) => m[1]).join('').replace(/''/g, "'");
  const fn = m004.match(/get_idea_support_counts\(\)[\s\S]*?as \$\$([\s\S]*?)\$\$/)[1];
  assert.equal(fn.toLowerCase().replace(/\s+/g, ' ').trim(), expected.trim());
});

test('011–013 brauchen keine der nicht ausgeführten Migrationen 008–010', () => {
  for (const name of ['011_tutoring.sql', '012_profiles_stats.sql', '013_project_members.sql']) {
    const sql = stripComments(read(name));
    assert.ok(!/archived_at|cancelled_at|archive_finished_events|admin_get_overview_stats|cron\./.test(sql), name);
    assert.ok(!/is_admin\(\)/.test(sql), `${name}: is_admin() kommt erst mit Admin-Anbindung (Stufe 7)`);
  }
});

test('alle Migrationen: $$-Blöcke vollständig (kein einzelnes $ als Begrenzer)', () => {
  const files = readdirSync(new URL('../supabase/migrations/', import.meta.url)).filter((f) => f.endsWith('.sql'));
  assert.ok(files.length >= 12);
  for (const name of files) {
    const code = stripComments(read(name));
    assert.equal((code.match(/\$\$/g) ?? []).length % 2, 0, `${name}: ungerade Anzahl $$`);
    const lone = code.split('\n').findIndex((line) => /(^|[\s(])\$(;|\s*$)/.test(line));
    assert.equal(lone, -1, `${name}: einzelnes $ als Begrenzer`);
  }
});
