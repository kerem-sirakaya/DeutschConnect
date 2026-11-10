// Projekt-/Eventgruppen erst nach Admin-Freigabe. Die Sperre liegt in Migration 014 (Server);
// das Frontend zeigt nur den Hinweis. Echter Datenbank-Test: supabase/tests/014_group_approval_test.sql.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  GROUP_READY_EVENT_STATUSES,
  GROUP_READY_IDEA_STATUSES,
  canCreateEventGroup,
  canCreateProjectGroup,
  isApprovalRejection,
} from '../src/lib/groupApproval.js';

const read = (...parts) => readFileSync(join(import.meta.dirname, '..', ...parts), 'utf8');
const sql = read('supabase', 'migrations', '014_chat.sql');
const fnBody = (name) => {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  return sql.slice(start, sql.indexOf('$$;', start));
};
const statusList = (body, alias) => body.match(new RegExp(`${alias}\\.status in \\(([^)]*)\\)`))[1].match(/'(\w+)'/g).map((s) => s.slice(1, -1));

test('Ideen: nur nach Admin-Freigabe (collecting/review/planned) – wartend oder abgelehnt blockiert', () => {
  for (const s of ['collecting', 'review', 'planned']) assert.equal(canCreateProjectGroup(s), true, s);
  for (const s of ['submitted', 'rejected', undefined, null, '', 'COLLECTING']) assert.equal(canCreateProjectGroup(s), false, String(s));
});

test('Events: nur veröffentlicht (planned/confirmed) – Entwurf, abgesagt, vorbei blockiert', () => {
  for (const s of ['planned', 'confirmed']) assert.equal(canCreateEventGroup(s), true, s);
  for (const s of ['draft', 'cancelled', 'completed', undefined, null]) assert.equal(canCreateEventGroup(s), false, String(s));
});

test('Frontend-Listen stimmen mit der Datenbank-Prüfung in Migration 014 überein', () => {
  assert.deepEqual(statusList(fnBody('chat_create_project_room'), 'i'), GROUP_READY_IDEA_STATUSES);
  assert.deepEqual(statusList(fnBody('chat_create_event_room'), 'e'), GROUP_READY_EVENT_STATUSES);
  // Server: Eventgruppe nur Staff, Projektgruppe nur Autor:in/Staff, keine Doppelten
  assert.match(fnBody('chat_create_event_room'), /if not public\.chat_is_staff\(uid\)/);
  assert.match(fnBody('chat_create_project_room'), /i\.author_id = uid or public\.chat_is_staff\(uid\)/);
  assert.match(fnBody('chat_create_project_room'), /on conflict \(idea_id\) do nothing/);
  assert.match(fnBody('chat_create_event_room'), /on conflict \(event_id\) do nothing/);
  // Keine Umgehung über die REST-API: chat_rooms ohne direkte Rechte, RLS an
  assert.match(sql, /'chat_rooms'[\s\S]*?enable row level security[\s\S]*?revoke all on public\.%I from public, anon, authenticated/);
});

test('Server-Ablehnung wird als Freigabe-Hinweis erkannt (nur der passende Fehlercode)', () => {
  assert.equal(isApprovalRejection('project', { code: '42501' }), true);
  assert.equal(isApprovalRejection('project', { code: 'DC041' }), false); // Sperre → normale Fehlermeldung
  assert.equal(isApprovalRejection('event', { code: 'P0002' }), true);
  assert.equal(isApprovalRejection('event', { code: '42501' }), false);
  assert.equal(isApprovalRejection('event', null), false);
  assert.equal(isApprovalRejection('topic', { code: '42501' }), false);
});

test('Hinweis nur beim Erstellungsversuch – nicht dauerhaft in Community/Gruppen/Chat', () => {
  const link = read('src', 'components', 'chat', 'ProjectChatLink.jsx');
  assert.match(link, /if \(!canCreateProjectGroup\(ideaStatus\)\) \{[\s\S]*?setNotApproved\(true\);\s*return;/);
  assert.match(link, /useState\(false\)/); // Startzustand: kein Hinweis
  assert.match(read('src', 'components', 'projects', 'ProjectParticipation.jsx'), /ideaStatus=\{idea\.status\}/);
  const mod = read('src', 'pages', 'ChatModerationPage.jsx');
  assert.match(mod, /if \(!canCreateEventGroup\(chosen\?\.status\)\)/);
  assert.match(mod, /\{eventNotApproved && <GroupApprovalNotice \/>\}/);
  for (const page of ['CommunityPage.jsx', 'CommunityGroupsPage.jsx', 'ChatPage.jsx']) {
    assert.doesNotMatch(read('src', 'pages', page), /GroupApprovalNotice|groupApprovalHint/, page);
  }
  for (const lang of ['de', 'en', 'tr']) assert.ok(JSON.parse(read('src', 'locales', `${lang}.json`)).chat.groupApprovalHint, lang);
});
