// Beta-UX: Begrüßung nach Tageszeit, Erfolgsmeldungen (Toasts), Chat-Übersicht, Hilfe/FAQ.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { greetingMessage, greetingName, greetingPeriod } from '../src/lib/greeting.js';
import { MAX_TOASTS, TOAST_DURATION_MS, addToast, removeToast } from '../src/lib/toastQueue.js';
import { roomPreviewTime, sortByActivity } from '../src/lib/chat.js';
import { HELP_SECTIONS } from '../src/lib/help.js';

const read = (...parts) => readFileSync(new URL(`../${parts.join('/')}`, import.meta.url), 'utf8');
const at = (h, m = 0) => new Date(2026, 10, 10, h, m, 0);
const locales = Object.fromEntries(['de', 'en', 'tr'].map((l) => [l, JSON.parse(read('src', 'locales', `${l}.json`))]));
const get = (dict, key) => key.split('.').reduce((node, part) => node?.[part], dict);

// ---------- Begrüßung ----------
test('Begrüßung: Grenzen der Tageszeiten (lokale Uhrzeit)', () => {
  const cases = [
    [4, 59, 'evening'], [5, 0, 'morning'], [11, 59, 'morning'], [12, 0, 'afternoon'],
    [17, 59, 'afternoon'], [18, 0, 'evening'], [23, 59, 'evening'], [0, 0, 'evening'],
  ];
  for (const [h, m, period] of cases) assert.equal(greetingPeriod(at(h, m)), period, `${h}:${m}`);
});

test('Begrüßung: echter Vorname, sonst Fassung ohne Namen – nie „undefined“/„null“', () => {
  assert.deepEqual(greetingMessage('Ada', at(8)), { key: 'home.greetingMorning', values: { name: 'Ada' } });
  assert.deepEqual(greetingMessage('  Deniz ', at(13)), { key: 'home.greetingAfternoon', values: { name: 'Deniz' } });
  for (const missing of [undefined, null, '', '   ', 'undefined', 'null', 42]) {
    assert.equal(greetingName(missing), null);
    assert.deepEqual(greetingMessage(missing, at(20)), { key: 'home.greetingEveningNoName', values: {} });
  }
});

test('Begrüßung: alle Texte in drei Sprachen; mit Namen enthält {name}, ohne Namen nicht', () => {
  for (const [lang, dict] of Object.entries(locales)) {
    for (const period of ['Morning', 'Afternoon', 'Evening']) {
      assert.match(get(dict, `home.greeting${period}`), /\{name\}/, `${lang} ${period}`);
      const plain = get(dict, `home.greeting${period}NoName`);
      assert.ok(plain && !plain.includes('{'), `${lang} ${period}NoName`);
    }
  }
});

test('Dashboard nutzt Vornamen aus dem Profil und erneuert die Tageszeit (useNow)', () => {
  const home = read('src', 'pages', 'HomePage.jsx');
  assert.match(home, /<DashboardGreeting firstName=\{user\.firstName\} \/>/);
  assert.match(home, /const now = useNow\(\);\s*const \{ key, values \} = greetingMessage\(firstName, now\)/);
});

// ---------- Toasts ----------
test('Toasts: gleiche Meldung nicht doppelt, höchstens MAX_TOASTS, Entfernen per id', () => {
  let list = [];
  list = addToast(list, { id: 1, message: 'A' });
  list = addToast(list, { id: 2, message: 'A' });
  assert.deepEqual(list, [{ id: 2, message: 'A' }]);
  for (let i = 3; i < 10; i += 1) list = addToast(list, { id: i, message: `M${i}` });
  assert.equal(list.length, MAX_TOASTS);
  assert.deepEqual(removeToast(list, list[0].id).length, MAX_TOASTS - 1);
  assert.ok(TOAST_DURATION_MS >= 3000 && TOAST_DURATION_MS <= 5000);
});

test('Toast-Region: aria-live, Schließen-Knopf, Escape, kein alert()', () => {
  const src = read('src', 'components', 'toast', 'ToastContext.jsx');
  assert.match(src, /role="status" aria-live="polite"/);
  assert.match(src, /aria-label=\{closeLabel\}/);
  assert.match(src, /event\.key === 'Escape'/);
  assert.match(src, /setTimeout\(\(\) => onDismiss\(toast\.id\), TOAST_DURATION_MS\)/);
  assert.match(read('src', 'main.jsx'), /<ToastProvider>/);
  for (const file of ['ToastContext.jsx']) assert.doesNotMatch(read('src', 'components', 'toast', file), /\balert\(/);
});

test('Erfolgsmeldung erst NACH bestätigtem Erfolg', () => {
  // Chat: action.run gibt bei Fehler false zurück
  assert.match(read('src', 'pages', 'ChatPage.jsx'), /if \(await action\.run\([\s\S]{0,140}\)\) \{\s*toast\.success/);
  assert.match(read('src', 'pages', 'ChatRoomPage.jsx'), /if \(!ok\) return;\s*\/\/[^\n]*\n\s*toast\.success/);
  assert.match(read('src', 'components', 'chat', 'MessageComposer.jsx'), /if \(result\) \{[\s\S]{0,200}toast\.success\(t\('toast\.messageSent'\)\)/);
  // Events: setRegistration liefert true nur ohne Datenbank-Fehler
  assert.match(read('src', 'state', 'useAccountEvents.js'), /return !error;/);
  // bei Fehler sofort zurück (seit der ownOnly-Rückmeldung: vorher Markierung zurücksetzen) – Toast nur danach
  assert.match(
    read('src', 'pages', 'EventDetailPage.jsx'),
    /const ok = await actions\.setRegistration\(event\.id, next\);\s*if \(!ok\) \{\s*if \(leavingOwnOnly\) setLeftOwnOnlyId\(null\);[^\n]*\n\s*return;\s*\}\s*if \(next === 'registered'\) toast\.success/,
  );
  // Profil-Freigabe
  assert.match(read('src', 'pages', 'ProfileSharingPage.jsx'), /if \(result\.ok\) toast\.success\(t\('toast\.sharingSaved'\)\)/);
});

test('Toast-Texte in allen drei Sprachen', () => {
  const keys = ['regionLabel', 'dismiss', 'roomJoined', 'roomLeft', 'messageSent', 'registered', 'registrationCancelled',
    'interestSaved', 'interestRemoved', 'sharingSaved'];
  for (const [lang, dict] of Object.entries(locales)) for (const key of keys) assert.ok(dict.toast?.[key], `${lang}: toast.${key}`);
});

// ---------- Chat-Übersicht ----------
test('Zeit der letzten Nachricht nur für Mitglieder', () => {
  const t = '2026-11-10T10:00:00Z';
  assert.equal(roomPreviewTime({ isMember: true, lastMessageAt: t }), t);
  assert.equal(roomPreviewTime({ isMember: false, lastMessageAt: t }), null);
  assert.equal(roomPreviewTime({ isMember: true, lastMessageAt: null }), null);
  assert.equal(roomPreviewTime(null), null);
});

test('Gruppen: neueste Nachricht zuerst, ohne Nachricht am Ende, Eingabe unverändert', () => {
  const rooms = [
    { id: 'a', lastMessageAt: null },
    { id: 'b', lastMessageAt: '2026-11-10T09:00:00Z' },
    { id: 'c', lastMessageAt: '2026-11-10T11:00:00+03:00' }, // = 08:00Z
    { id: 'd', lastMessageAt: '2026-11-10T12:00:00Z' },
  ];
  assert.deepEqual(sortByActivity(rooms).map((r) => r.id), ['d', 'b', 'c', 'a']);
  assert.equal(rooms[0].id, 'a');
});

test('Übersicht lädt live nach, Projekt-Link nicht; Ungelesen-Punkt nur aus echtem Lesestand (020)', () => {
  const page = read('src', 'pages', 'ChatPage.jsx');
  assert.match(page, /useChatRooms\(\{ live: true \}\)/);
  assert.match(read('src', 'components', 'chat', 'ProjectChatLink.jsx'), /useChatRooms\(\)/);
  // der Punkt hängt allein an has_unread aus chat_inbox_state – nie an Zeitstempeln geraten
  assert.match(page, /if \(!entry\?\.hasUnread\) return null;/);
  assert.doesNotMatch(page, /markRead|chat_mark_read|markDisplayed/);
});

// ---------- Hilfe ----------
test('Hilfe: Route, Links (Fußzeile, Profil-Menü, Mein Bereich) und alle Fragen übersetzt', () => {
  assert.match(read('src', 'App.jsx'), /<Route path="help" element=\{<HelpPage \/>\} \/>/);
  assert.match(read('src', 'components', 'layout', 'AppShell.jsx'), /<Link to="\/help">/);
  assert.match(read('src', 'components', 'ProfileMenu.jsx'), /<Link to="\/help"/);
  assert.match(read('src', 'pages', 'MePage.jsx'), /<ListLink to="\/help"/);
  assert.match(read('src', 'pages', 'HelpPage.jsx'), /<details[^>]*>\s*<summary/);
  for (const [lang, dict] of Object.entries(locales)) {
    for (const section of HELP_SECTIONS) {
      assert.ok(get(dict, `help.sections.${section.id}.title`), `${lang} ${section.id}`);
      for (const q of section.questions) {
        assert.ok(get(dict, `help.sections.${section.id}.${q}.q`)?.endsWith('?'), `${lang} ${section.id}.${q}.q`);
        assert.ok(get(dict, `help.sections.${section.id}.${q}.a`), `${lang} ${section.id}.${q}.a`);
      }
    }
  }
});

test('Hilfe nennt die echten Knopf-Beschriftungen', () => {
  for (const [lang, dict] of Object.entries(locales)) {
    const all = JSON.stringify(dict.help);
    for (const label of [dict.chat.join, dict.chat.leave, dict.chat.enter, dict.chat.send, dict.eventDetail.register,
      dict.eventDetail.cancelRegistration, dict.eventDetail.markInterest, dict.profiles.sharingTitle]) {
      assert.ok(all.includes(label), `${lang}: „${label}“ fehlt in der Hilfe`);
    }
  }
});
