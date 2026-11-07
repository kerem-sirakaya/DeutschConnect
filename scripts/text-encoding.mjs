import assert from 'node:assert/strict';

const questionKeys = new Set([
  'homeEvents.title', 'cta.text', 'aboutPage.storyTitle',
  'aboutPage.statusTitle', 'app.newIdeaDescription',
]);
const encodingDamage = /\uFFFD|[\u00C2-\u00C5\u00E2][\u0080-\u00BF]/u;

export function decodeUtf8(bytes, label) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`${label}: invalid UTF-8 bytes`);
  }
}

export function assertReadableText(text, label) {
  assert.ok(!encodingDamage.test(text), `${label}: replacement character or broken encoding`);
}

export function assertTranslationText(text, key, label = key) {
  assertReadableText(text, label);
  if (!text.includes('?')) return;
  assert.ok(questionKeys.has(key), `${label}: unexpected question mark; check lost characters`);
  assert.ok(!/\?{2,}|\?[\p{L}\p{N}]/u.test(text), `${label}: question mark inside a word`);
}

export function assertRenderedText(text, label) {
  assertReadableText(text, label);
  assert.ok(!/(?:^|\s)\?(?=\s|$)|\?[\p{L}\p{N}]/u.test(text), `${label}: damaged visible text or separator`);
}
