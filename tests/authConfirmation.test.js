// Verhalten des echten Supabase-SDKs mit rein fiktiven Links, Konten und HTTP-Antworten.
// Kein E-Mail-Versand, keine Cloud-Anfragen und keine echten Zugangsdaten.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { createClient } from '@supabase/supabase-js';

const USER = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'fictional@example.org',
  email_confirmed_at: '2026-11-14T00:00:00Z',
  app_metadata: {},
  user_metadata: {},
};
const ACCESS_TOKEN = 'synthetic-access-token';
const CONFIRMATION_URL =
  `https://connected.example/login#access_token=${ACCESS_TOKEN}` +
  '&refresh_token=synthetic-refresh-token&expires_in=3600&token_type=bearer&type=signup';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

function browserHarness(t, href, storageKey) {
  const storage = memoryStorage();
  const browser = { location: new URL(href), history: { state: null, replaceState() {} } };
  const replacements = {
    window: browser,
    document: { visibilityState: 'hidden' },
    localStorage: storage,
    // Diese isolierten Tests simulieren einen Tab; keine nativen Channel-Handles öffnen.
    BroadcastChannel: undefined,
  };
  const originalGlobals = new Map(
    Object.keys(replacements).map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]),
  );
  for (const [name, value] of Object.entries(replacements)) {
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }

  const clients = [];
  const requests = [];
  t.after(async () => {
    try {
      for (const client of clients) {
        // Auch bei fehlgeschlagenen Assertions erst Initialisierung und SDK-Ereignisse beenden.
        await client.auth.initialize();
        await delay(0);
        await client.auth.dispose(); // Timer, Listener und ggf. BroadcastChannel schließen.
        // Unbenutztes Realtime öffnet keine Verbindung. disconnect() selbst würde im SDK einen
        // zusätzlichen Timeout starten; deshalb nur tatsächlich aktive Verbindungen schließen.
        if (client.getChannels().length || client.realtime.connectionState() !== 'closed') {
          await client.removeAllChannels();
        }
      }
    } finally {
      for (const [name, descriptor] of originalGlobals) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else delete globalThis[name];
      }
    }
  });

  const fetcher = async (input, options = {}) => {
    const url = new URL(input);
    requests.push({
      path: url.pathname,
      method: options.method ?? 'GET',
      authorization: new Headers(options.headers).get('Authorization'),
    });
    const isUserRequest = url.origin === 'https://auth.example' && url.pathname === '/auth/v1/user';
    return new Response(JSON.stringify(isUserRequest ? USER : { message: 'Unexpected synthetic request' }), {
      status: isUserRequest ? 200 : 400,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  return {
    browser,
    requests,
    storage,
    client() {
      const client = createClient('https://auth.example', 'sb_publishable_fixture_only', {
        global: { fetch: fetcher },
        // URL-Erkennung, Implicit-Flow und Persistenz behalten ihre produktiven SDK-Defaults.
        auth: { storage, storageKey, autoRefreshToken: false },
      });
      clients.push(client);
      return client;
    },
  };
}

describe('E-Mail-Bestätigung mit dem Supabase-SDK', { concurrency: false }, () => {
  test('Bestätigungslink meldet das verifizierte Konto ohne erneute Passworteingabe an', async (t) => {
    const harness = browserHarness(t, CONFIRMATION_URL, 'test-confirmation-callback');
    const client = harness.client();
    const events = [];
    client.auth.onAuthStateChange((event, session) => events.push({ event, userId: session?.user?.id }));

    const { data, error } = await client.auth.getSession();
    await delay(0);

    assert.equal(error, null);
    assert.equal(data.session?.user.id, USER.id);
    assert.equal(data.session?.user.email_confirmed_at, USER.email_confirmed_at);
    assert.equal(harness.browser.location.pathname, '/login');
    assert.equal(harness.browser.location.hash, '', 'Das SDK entfernt die Tokens aus der Adresse');
    assert.ok(events.some(({ event, userId }) => event === 'SIGNED_IN' && userId === USER.id));
    assert.deepEqual(harness.requests, [
      { path: '/auth/v1/user', method: 'GET', authorization: `Bearer ${ACCESS_TOKEN}` },
    ]);
  });

  test('Nach Neuladen bleibt dasselbe Konto ohne erneuten Bestätigungslink angemeldet', async (t) => {
    const harness = browserHarness(t, CONFIRMATION_URL, 'test-confirmation-reload');
    const firstClient = harness.client();
    assert.equal((await firstClient.auth.getSession()).data.session?.user.id, USER.id);
    await delay(0);
    await firstClient.auth.dispose();
    harness.browser.location = new URL('https://connected.example/login');

    // Eine neue SDK-Instanz bildet den Neustart nach einem Neuladen ab. Der Speicher bleibt erhalten.
    const restoredClient = harness.client();
    const { data, error } = await restoredClient.auth.getSession();

    assert.equal(error, null);
    assert.equal(data.session?.user.id, USER.id);
    assert.equal(data.session?.user.email, USER.email);
    assert.equal(harness.requests.length, 1, 'Für die noch gültige Sitzung ist kein neuer Login nötig');
  });

  test('Ein abgelaufener Bestätigungslink erzeugt keine angemeldete Sitzung', async (t) => {
    const harness = browserHarness(
      t,
      'https://connected.example/login#error=access_denied&error_code=otp_expired&error_description=Expired',
      'test-confirmation-expired',
    );
    const client = harness.client();
    const events = [];
    client.auth.onAuthStateChange((event) => events.push(event));

    const initialization = await client.auth.initialize();
    const { data } = await client.auth.getSession();
    await delay(0);

    assert.ok(initialization.error);
    assert.equal(data.session, null);
    assert.equal(harness.storage.getItem('test-confirmation-expired'), null);
    assert.equal(events.includes('SIGNED_IN'), false);
    assert.deepEqual(harness.requests, []);
  });
});
