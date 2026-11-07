import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeUtf8, assertReadableText, assertTranslationText, assertRenderedText } from './text-encoding.mjs';

test('German and Turkish characters survive UTF-8 decoding', () => {
  const text = 'Übersicht · Für dich · Änderungen · Größe · Öğrenci · Katılım · ç ğ ı İ ö ş ü';
  assert.equal(decodeUtf8(Buffer.from(text, 'utf8'), 'fixture'), text);
  assert.doesNotThrow(() => assertTranslationText(text, 'fixture'));
});

test('invalid UTF-8 and replacement characters are rejected', () => {
  assert.throws(() => decodeUtf8(Buffer.from([0xc3, 0x28]), 'fixture'), /invalid UTF-8/);
  assert.throws(() => assertReadableText('Gr\uFFFD\uFFFDe', 'fixture'));
  assert.throws(() => assertReadableText('F\u00C3\u00BCr dich', 'fixture'));
});

test('ASCII-loss question marks are detected while genuine questions remain valid', () => {
  for (const [key, text] of [['nav.home', '?bersicht'], ['app.forYou', 'F?r dich'], ['app.demoShort', 'Profiles ? local only'], ['app.schoolReason', 'format?']]) {
    assert.throws(() => assertTranslationText(text, key));
  }
  assert.doesNotThrow(() => assertTranslationText('Was möchtest du gemeinsam machen?', 'app.newIdeaDescription'));
  assert.throws(() => assertTranslationText('Was m?chtest du gemeinsam machen?', 'app.newIdeaDescription'));
});

test('rendered checks catch damaged JSX arrows and separators', () => {
  assert.throws(() => assertRenderedText('ERS ? Ankara', 'fixture'));
  assert.throws(() => assertRenderedText('? Zurück', 'fixture'));
  assert.doesNotThrow(() => assertRenderedText('ERS · Ankara ← Zurück', 'fixture'));
});
