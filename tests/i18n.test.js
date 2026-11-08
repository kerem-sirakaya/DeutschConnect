// Prüft, dass alle drei Sprachdateien vollständig sind. Ausführen mit: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { TOPICS, EVENT_FORMATS } from '../src/data/topics.js';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const load = (lang) => JSON.parse(readFileSync(join(root, 'src', 'locales', `${lang}.json`), 'utf8'));
const locales = { de: load('de'), tr: load('tr'), en: load('en') };

function flatten(obj, prefix = '') {
  return Object.entries(obj).flatMap(([key, value]) =>
    value && typeof value === 'object' ? flatten(value, `${prefix}${key}.`) : [`${prefix}${key}`],
  );
}

function has(dict, key) {
  const get = (k) => k.split('.').reduce((node, part) => node?.[part], dict);
  return typeof get(key) === 'string' || typeof get(`${key}_one`) === 'string';
}

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(jsx?|js)$/.test(name) ? [path] : [];
  });
}

test('alle Sprachen haben exakt dieselben Schlüssel', () => {
  const deKeys = flatten(locales.de).sort();
  for (const lang of ['tr', 'en']) {
    assert.deepEqual(flatten(locales[lang]).sort(), deKeys, `Schlüssel in ${lang}.json weichen ab`);
  }
});

test('keine leeren Übersetzungen', () => {
  for (const [lang, dict] of Object.entries(locales)) {
    for (const key of flatten(dict)) {
      const value = key.split('.').reduce((node, part) => node[part], dict);
      assert.ok(String(value).trim().length > 0, `${lang}: ${key} ist leer`);
    }
  }
});

test('jeder im Code verwendete Schlüssel existiert in allen Sprachen', () => {
  const pattern = /\bt\(\s*['"]([\w.]+)['"]/g;
  const keyProps = /(?:labelKey|shortKey|textKey|titleKey|key):\s*['"]([\w.]+)['"]/g;
  const keyAttrs = /(?:labelKey|textKey|titleKey)=["']([\w.]+)["']/g;
  const used = new Set();
  for (const file of sourceFiles(join(root, 'src'))) {
    const code = readFileSync(file, 'utf8');
    for (const regex of [pattern, keyProps, keyAttrs]) {
      for (const match of code.matchAll(regex)) if (match[1].includes('.')) used.add(match[1]);
    }
  }
  // Dynamische Schlüssel (z. B. t(`topics.${id}`)) explizit ergänzen
  TOPICS.forEach((id) => used.add(`topics.${id}`));
  EVENT_FORMATS.forEach((id) => used.add(`formats.${id}`));
  ['draft', 'planned', 'confirmed', 'completed', 'cancelled'].forEach((s) => used.add(`status.event.${s}`));
  ['submitted', 'collecting', 'review', 'planned'].forEach((s) => {
    used.add(`status.idea.${s}`);
    used.add(`ideaDetail.steps.${s}`);
  });
  // "rejected" (Migration 006): Status-Text + eigener End-Schritt in der Fortschrittsanzeige
  used.add('status.idea.rejected');
  used.add('ideaDetail.steps.rejected');
  ['initiator', 'interest', 'confirmed'].forEach((s) => {
    used.add(`status.partnership.${s}`);
    used.add(`network.legend.${s}`);
  });
  ['organizer', 'registered', 'interested', 'member'].forEach((r) => used.add(`roles.${r}`));

  const missing = [];
  for (const key of used) {
    for (const [lang, dict] of Object.entries(locales)) if (!has(dict, key)) missing.push(`${lang}: ${key}`);
  }
  assert.deepEqual(missing, []);
  assert.ok(used.size > 150, `zu wenige Schlüssel gefunden (${used.size}) – Muster prüfen`);
});
