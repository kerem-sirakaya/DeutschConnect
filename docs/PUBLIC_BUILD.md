# Öffentlicher Build und Passwort-Wiederherstellung (Phase 2A / 2A.1)

Stand: 2026-11-11 · Branch `integration-v1`

## Entscheidung

Die öffentliche Connect/ED-Website nutzt das **bisherige Staging-Supabase-Projekt**
(`ycyqdqmiawhzzrduxupe.supabase.co`). Das alte Live-Projekt wird nicht verwendet und nicht verändert.

## Befehle

| Befehl | Zweck | Supabase-Projekt | STAGING-Kennzeichen |
|---|---|---|---|
| `npm run build` | **Öffentlicher Build** nach `dist/` (Standard, auch für Hoster) | nur `ycyqdqmiawhzzrduxupe` | nein |
| `npm run build:public` | gleicher Build (Alias) | nur `ycyqdqmiawhzzrduxupe` | nein |
| `npm run check:public` | Prüft die Werte vorab (gibt nur Host und Quelle aus, nie den Key) | – | – |
| `npm run dev:staging` / `npm run check:staging` | Entwicklung/Test gegen Staging (unverändert) | Staging | ja |
| `vite build` ohne `--mode` | **wird abgelehnt** (würde `.env.local` = altes Live-Projekt laden) | – | – |

Es gibt keinen Build-Befehl mehr, der `.env.local` (altes Live-Projekt) verwendet.
Hinweis: `npm run dev` (Entwicklungsserver ohne Modus) lädt weiterhin `.env.local` – für Browser-Tests nur
`npm run dev:staging` verwenden.

## Woher kommen die Werte?

**Gehosteter Build** (Umgebungsvariable `CI`, `VERCEL` oder `NETLIFY` gesetzt, nicht `false`/`0`):
nur Umgebungsvariablen, **alle drei Pflicht**, keine Datei als Ersatz:

| Variable | Wert |
|---|---|
| `VITE_SUPABASE_URL` | `https://ycyqdqmiawhzzrduxupe.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | publishable Key des Staging-Projekts (`sb_publishable_…`) |
| `VITE_ENABLE_SIGNUP` | ausdrücklich `true` oder `false` (Registrierungsformular sichtbar?) |

**Lokal:** Umgebungsvariablen, falls URL oder Key gesetzt sind – sonst die Datei `.env.staging.local`
(wie bei `npm run dev:staging`). Auch dort muss `VITE_ENABLE_SIGNUP` ausdrücklich stehen.

`.env.local` wird beim Bauen **nie** gelesen (Vite bekommt einen leeren `envDir`).

## Sicherungen (Build bricht ab)

Vor dem Bauen (`scripts/publicEnv.mjs`):

- URL, publishable Key oder `VITE_ENABLE_SIGNUP` fehlt (gehostet: als Umgebungsvariable)
- URL ist nicht genau `https://ycyqdqmiawhzzrduxupe.supabase.co` (anderes Projekt, `http://`, ähnliche Hosts)
- URL zeigt auf das alte Live-Projekt
- Key ist geheim (`sb_secret_…`, `service_role`) oder kein `sb_publishable_…`-Key
- `VITE_ENABLE_SIGNUP` ist weder `true` noch `false`
- `vite build` ohne Modus `public`/`staging`

Nach dem Bauen (Vite-Plugin `verifyPublicBundle`): Der erzeugte JavaScript-Code muss den freigegebenen Host
enthalten und darf weder das alte Live-Projekt noch einen geheimen Key noch das STAGING-Kennzeichen enthalten.
Im Build-Log stehen nur Host und Quelle, nie der Key.

## Passwort vergessen

Ablauf mit Supabase Auth (supabase-js 2.119, Standard-Flow „implicit“, keine eigene Logik für Token):

1. Login → „Passwort vergessen?“ → `/forgot-password` → `resetPasswordForEmail(email, { redirectTo: <origin>/reset-password })`.
   **Neutrale Bestätigung:** Erfolg und Wartezeit (HTTP 429 / `over_email_send_rate_limit`) zeigen **dieselbe**
   Bestätigung („Falls es zu dieser Adresse ein Konto gibt …“, mit Hinweis auf mögliche Wartezeit für alle).
   Supabase antwortet für bestehende Konten bei einer zweiten Anfrage kurz danach mit 429 – eine eigene
   Meldung würde sonst verraten, dass das Konto existiert. Nur Netzwerk- und unerwartete Serverfehler
   werden als Fehler gezeigt (ohne Rohdaten von Supabase).
2. Der Link in der E-Mail öffnet `/reset-password`. supabase-js löst ihn ein, entfernt die Token aus der Adresse
   und meldet `PASSWORD_RECOVERY`. Landet der Link auf einer anderen Seite (z. B. Site URL), wechselt die App
   vorher auf `/reset-password`.
3. Neues Passwort (mind. 8 Zeichen) + Wiederholung → `updateUser({ password })` → Wiederherstellung beenden →
   überall abmelden → `/login` mit Erfolgsmeldung.
4. Abgelaufene (`otp_expired`) und ungültige Links, eine fehlende Wiederherstellungs-Sitzung und ein normaler
   Login zeigen „Link abgelaufen/ungültig“ mit „Neuen Link anfordern“.

**Wer darf das Formular sehen?** Nur die Sitzung, für die das Ereignis `PASSWORD_RECOVERY` kam
(`createRecoveryStore` in `src/lib/passwordRecovery.js`, Listener direkt nach `createClient` in
`src/lib/supabaseClient.js`, damit das Ereignis nie verpasst wird). Der Link in der Adresse allein schaltet nichts
frei (Review M1: sonst hätte eine spätere normale Anmeldung im selben Tab das Formular wieder geöffnet).
`SIGNED_OUT` und erfolgreiches Speichern beenden die Wiederherstellung; eine normale Anmeldung schaltet nie
etwas frei.

Gespeichert wird nur ein Merker in `sessionStorage` (`connected.passwordRecovery` = Konto-ID, **kein Token**),
damit Neuladen den Ablauf nicht abbricht.

## Vor dem Start im Supabase-Dashboard nötig (nicht Teil dieser Änderung)

- Authentication → URL Configuration → **Site URL** = Produktions-URL.
- **Redirect URLs**: `<Produktions-URL>/reset-password`, `<Produktions-URL>/login` (Registrierungs-Bestätigung),
  für lokale Tests `http://localhost:5173/reset-password`; Preview-URLs nur bewusst.
- Eigener **SMTP**-Versand (der eingebaute Versand ist stark begrenzt) und Vorlage „Reset Password“ auf Connect/ED.
- **Mindestlänge für Passwörter** auf 8 (die App prüft 8; der Server erlaubt standardmäßig weniger).

## Beim Hoster nötig

- Build-Befehl `npm run build` (Standard), Ausgabe `dist`.
- Die drei Umgebungsvariablen oben (sonst bricht der Build ab).
- SPA-Fallback: alle App-Pfade (auch `/reset-password`, `/forgot-password`) auf `index.html`, Assets ausgenommen.
- HTTPS.

## Bekannte Grenzen

- Kann das eigene Profil während der Wiederherstellung nicht geladen werden, zeigt die App wie bei jeder
  Anmeldung „Profil konnte nicht geladen werden“.
- Wer den Ablauf abbricht, bleibt mit der Wiederherstellungs-Sitzung angemeldet (Supabase-Standard), bis er sich
  abmeldet oder sie abläuft; solange darf er auf `/reset-password` ein neues Passwort setzen.
- Scheitert nach dem Speichern das Abmelden (offline), zeigt `/login` die Konto-Karte statt der Erfolgsmeldung.
- Über die Supabase-API selbst (nicht über die App) lässt sich am 429 weiterhin erkennen, ob ein Konto existiert.
- Getestet im Browser mit abgefangenen Supabase-Antworten; ein Test mit echter E-Mail an ein freigegebenes
  Staging-Testkonto steht aus.
