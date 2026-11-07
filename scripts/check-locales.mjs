import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertTranslationText, decodeUtf8 } from './text-encoding.mjs';

// Check the full translation contract, including arrays and non-empty strings.
function entries(value, prefix = '') {
  return Object.entries(value).flatMap(([key, item]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof item === 'string') {
      assert.ok(item.trim(), `Empty translation: ${path}`);
      assertTranslationText(item, path);
      return [path];
    }
    assert.ok(item && typeof item === 'object', `Invalid translation: ${path}`);
    return entries(item, path);
  }).sort();
}

const languages = ['de', 'tr', 'en'];
let reference;
for (const language of languages) {
  const bytes = readFileSync(new URL(`../src/locales/${language}.json`, import.meta.url));
  const base = JSON.parse(decodeUtf8(bytes, language));
  const extensionBytes = readFileSync(new URL(`../src/locales/modules/${language}.json`, import.meta.url));
  const ext = JSON.parse(decodeUtf8(extensionBytes, language + ' modules'));
  const qualityBytes = readFileSync(new URL(`../src/locales/quality/${language}.json`, import.meta.url));
  const quality = JSON.parse(decodeUtf8(qualityBytes, language + ' quality'));
  const personal = JSON.parse(decodeUtf8(readFileSync(new URL(`../src/locales/personal/${language}.json`, import.meta.url)), language + ' personal'));
  const platform = JSON.parse(decodeUtf8(readFileSync(new URL(`../src/locales/platform/${language}.json`, import.meta.url)), language + ' platform'));
  const data = { ...base, ext, quality, personal, ...platform, nav: { ...base.nav, ...ext.nav }, categories: { ...base.categories, open: ext.open } };
  const keys = entries(data);
  if (reference) assert.deepEqual(keys, reference, `${language}: translation keys differ`);
  reference = keys;
  console.log(`${language}: ${keys.length} non-empty translations checked`);
}
console.log('All three language files have matching translation keys and valid text encoding.');
