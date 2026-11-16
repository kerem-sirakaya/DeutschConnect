import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ARCADE_FIELD, arcadeViewport } from '../src/games/arcadeCanvas.js';

test('Hochformat erweitert die Spielwelt und erhält gleichmäßige Zeichenmaßstäbe', () => {
  for (const [width, height] of [[324, 420], [284, 220], [394, 460]]) {
    const viewport = arcadeViewport(width, height, true);
    assert.equal(viewport.width, 640);
    assert.ok(viewport.height > 300);
    assert.ok(Math.abs(width / viewport.width - height / viewport.height) < 1e-10);
  }
});

test('Desktop, Querformat und noch nicht sichtbare Canvas behalten die bisherige Welt', () => {
  assert.equal(arcadeViewport(640, 300), ARCADE_FIELD);
  assert.equal(arcadeViewport(320, 150), ARCADE_FIELD);
  assert.equal(arcadeViewport(0, 220, true), ARCADE_FIELD);
  assert.equal(arcadeViewport(324, 0, true), ARCADE_FIELD);
});
