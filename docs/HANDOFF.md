# DeutschConnect – Übergabe für die nächste Arbeitssitzung

Stand: 2026-11-08 · Branch: `claude-version-1.0` · Hauptbranch: `main`
Diese Datei fasst den technischen Stand zusammen. Sie ersetzt nicht `README.md` und `AGENTS.md` – beide zuerst lesen.

---

## 1. Projekt in einem Satz

Schülergeführte Plattform für schulübergreifende Events, Ideen und Projekte, Pilot zwischen
**Ernst-Reuter-Schule Ankara (`ers`)** und **Anka Bilim (`anka`)**. React-Web-App, mobil zuerst,
Deutsch/Türkisch/Englisch. Abgemeldete Besucher sehen eine **Demo**, angemeldete Nutzer echte
Supabase-Daten.

Arbeitsregeln aus `AGENTS.md` (Auszug): erst Repo prüfen, kleinste nötige Änderung, keine großen
Abhängigkeiten ohne Begründung, keine Secrets, nichts deployen oder zerstören ohne Erlaubnis,
vorhandene Checks laufen lassen (`npm test`, `npm run build`), auf **Deutsch** erklären,
klar trennen zwischen „funktioniert“, „Demo“ und „geplant“.

---

## 2. Technik und Umgebung

| Bereich | Stand |
|---|---|
| Frontend | React 19, Vite 6, `react-router` 7, eigenes i18n (`src/i18n`, `src/locales/{de,tr,en}.json`) |
| Backend | Supabase (Auth + Postgres + RLS), `@supabase/supabase-js` 2.119 |
| Tests | `npm test` = `node --test` (Ordner `tests/`), zuletzt **44/44 bestanden**; `npm run build` erfolgreich |
| Env | `.env.local` (nicht im Git): `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_…`), optional `VITE_ENABLE_SIGNUP` (Standard aus). Vorlage: `.env.example` |
| Dev-Server | `npm run dev` → **Port 5173** (Supabase-Redirect hängt daran). Achtung: Läuft schon ein Server, weicht Vite auf 5174 aus – dann passt der E-Mail-Redirect nicht. |
| Supabase Auth | Site URL `http://localhost:5173`, Redirect URL `http://localhost:5173/login`, E-Mail-Bestätigung an. Registrierung im Dashboard nur zum Testen öffnen („Allow new users to sign up“), danach schließen. |
| Git | Unter Windows ist `git` nicht im PATH; funktionierender Pfad: `%LOCALAPPDATA%\GitHubDesktop\app-3.6.10\resources\app\git\cmd\git.exe`. **Alle Änderungen dieser Sitzungen sind noch nicht committet** (Großteil von `src/`, `supabase/`, `tests/` ist untracked). |

Test-Konten (echte Supabase-Konten, nur fiktive Daten):
- **Konto A** – Haupt-Testkonto, Vorname „Ege“, ist **Admin** (Eintrag in `public.admins`, Notiz „Pilot-Admin“). Nicht ändern.
- **Konto B** – zweites Konto über Gmail-Plus-Adresse („+test2“), normale:r Schüler:in.
- E-Mail-Adressen stehen bewusst **nicht** in Dateien; nur im Supabase SQL Editor eintragen.

---

## 3. Frontend-Architektur

```
main.jsx
 └ BrowserRouter
    └ LanguageProvider        (src/i18n/LanguageContext.jsx)
       └ AuthProvider          (src/auth/AuthContext.jsx)
          └ AppStateProvider   (src/state/AppStateContext.jsx)  ← zentrale Datenquelle
             └ App (Routen in src/App.jsx, alle innerhalb AppShell)
```

**Zentraler Zustand `useAppState()`** – alle Seiten lesen nur hier:
`user`, `events`, `getEvent(id)`, `ideas`, `supportCounts`, `registrationSync`, `ideaSync`,
`isRealAccount`, `mode`, `actions`.

| Modus | Wann | Datenquelle |
|---|---|---|
| `demo` | nicht angemeldet (oder Supabase nicht konfiguriert) | `src/data/*.js` + localStorage `deutschconnect.demoState` |
| `loading` | Sitzung, Profil, Events oder Ideen laden | `ProfileGate` zeigt Ladebildschirm |
| `error` | Profil/Events/Ideen nicht ladbar | `ProfileGate` mit „Erneut versuchen“ / „Abmelden“ – **kein** stiller Rückfall auf Demo |
| `account` | angemeldet, alles geladen | Supabase (siehe unten) |

Im Konto-Modus:
- **Profil** (`first_name`, `grade`, `school_id`, `avatar_color`, `interests`, Schul-Join) aus `profiles` – `AuthContext`.
  Interessen werden per `updateInterests` (Warteschlange, optimistisch) in `profiles.interests` gespeichert.
- **Events + eigene Anmeldungen** aus `events` / `event_registrations` – `src/lib/eventsApi.js`, `src/state/useAccountEvents.js`.
- **Ideen, eigene Unterstützungen, Zahlen** aus `ideas` / `idea_supports` / RPC `get_idea_support_counts` – `src/lib/ideasApi.js`, `src/state/useAccountIdeas.js`.
- **Nur noch lokal (pro Konto):** Projekt-Interesse und ausgeblendete Hinweise unter `deutschconnect.accountState.v1.<userId>`.
  Ältere Felder dort (`registrations`, `supportedIdeas`, `customIdeas`) werden nicht mehr gelesen, aber nicht gelöscht.
- Abmelden → automatisch wieder das zuletzt gewählte Demo-Profil. „Demo zurücksetzen“ betrifft nur die Demo.
- `actions.addIdea` / `actions.deleteIdea` geben in **beiden** Modi ein Promise zurück (`{ id }` / `{ errorKey }`).

Wichtige Dateien:

| Datei | Zweck |
|---|---|
| `src/lib/supabaseClient.js` | einziger Supabase-Client; blockiert `sb_secret_`/`service_role`-Keys; `checkSupabaseConnection()` (nur DEV, prüft `profiles` → erwartet `42501`) |
| `src/auth/AuthContext.jsx` | Sitzung, Profil, `signUp` (Metadaten `first_name`, `school_id`, `grade`; Redirect `/login`), `signIn`, `signOut`, `reloadProfile`, `updateInterests` |
| `src/lib/authValidation.js` | Formularregeln + Supabase-Fehler → i18n-Schlüssel |
| `src/lib/accountProfile.js` | `buildAccountUser(userId, profile, data, registrations, supportedIdeas)` |
| `src/lib/eventsApi.js` | `mapDbEvent`, `fetchEvents`, `fetchMyRegistrations`, `saveRegistration`, `registrationErrorKey` |
| `src/lib/ideasApi.js` | `PUBLIC_IDEA_STATUSES`, `mapDbIdea`, `canSupportIdea`, `fetchIdeasState`, `createIdea`, Unterstützen/Entfernen, `deleteOwnIdea`, `ideaErrorKey` |
| `src/pages/LoginPage.jsx`, `RegisterPage.jsx` | `/login`, `/register` (Registrierung nur mit `VITE_ENABLE_SIGNUP=true`; Schulen aus DB, Rückfall `src/data/schools.js`) |
| `src/components/AccountCard.jsx`, `ProfileGate.jsx` | Konto-Status; Lade-/Fehlerbildschirm |
| `src/pages/EventDetailPage.jsx` | Anmelden/Interesse/Abmelden mit Speicherzustand; „Anmeldung geschlossen“, fehlende Dauer, unbekannte Schulen |
| `src/pages/NewIdeaPage.jsx`, `IdeaDetailPage.jsx`, `components/SupportButton.jsx` | Ideen einreichen, „Wartet auf Freigabe“, Löschen, Unterstützen nur für fremde freigegebene Ideen |

Weiterhin **Demo-only**: Projekte (`src/data/projects.js`), Einladungen, Schul-Detaildaten
(Farben/Beschreibungen in `src/data/schools.js` – **doppelte Pflege** mit Tabelle `schools`).

---

## 4. Datenbank – Migrationen

Alle Migrationen liegen in `supabase/migrations/`. Ausführung immer manuell im Supabase SQL Editor
(als `postgres`). Tests in `supabase/tests/`.

| Nr. | Datei | Inhalt | Live-Status (laut Team) |
|---|---|---|---|
| 001 | `001_initial_schema.sql` | Tabellen, Trigger `handle_new_user`, `get_idea_support_counts`, Grants, RLS | ausgeführt |
| 002 | `002_restrict_registration_update.sql` | `event_registrations`: Update nur Spalte `status` | ausgeführt |
| 003 | `003_public_school_info.sql` | `anon` darf `schools` (nur `id, name, short_name, city`) lesen | ausgeführt, live geprüft |
| 004 | `004_ideas_moderation.sql` | Ideen-Moderation (siehe unten) | ausgeführt – vermutlich **v3 aus dem Chat**; **Datei im Repo enthält noch v1** (siehe Offene Punkte) |
| 005 | `005_admin_role.sql` | `public.admins` + `public.is_admin()` mit Selbstprüfung | ausgeführt; Konto A eingetragen |
| 006 | `006_admin_events_ideas.sql` | Admin-Funktionen, Entwürfe, Anmelde-Trigger, Plätze | **NICHT ausgeführt** – final überarbeitet, nur statisch geprüft |

### 4.1 Schema nach 001 (Kurzfassung)

- `schools(id text pk, name, short_name, city, partnership_status check initiator/interest/confirmed, created_at)` – Daten `ers`, `anka`.
- `profiles(id uuid pk → auth.users on delete cascade, first_name 1–40, school_id → schools, grade 5–13, avatar_color hex, interests text[] ≤20, created_at, updated_at)`; Trigger `handle_new_user` (security definer) legt Profil aus `raw_user_meta_data` an; `set_updated_at`.
- `events(id uuid pk default gen_random_uuid(), title jsonb not null, summary/description/location/audience jsonb, start_at timestamptz not null, duration_minutes int >0, capacity int >0, online bool not null default false, topics text[] not null default '{}', format text not null default 'meetup' check (workshop|meetup|discussion|competition|online|project), host_school_id text not null → schools, school_ids text[] not null cardinality ≥1 (kein FK), status text not null default 'planned' check (planned|confirmed|completed|cancelled), created_at)`.
- `event_registrations(event_id → events on delete cascade, user_id default auth.uid() → profiles on delete cascade, status not null check (registered|interested), created_at, pk (event_id, user_id))`.
- `ideas(id uuid pk, author_id default auth.uid() → profiles cascade, school_id → schools, title 5–80, summary ≤200 not null, description 20–600, topics 1–3, format (Liste), school_ids ≥1, status default 'submitted' check (submitted|collecting|review|planned), created_at)`.
- `idea_supports(idea_id → ideas cascade, user_id default auth.uid() → profiles cascade, created_at, pk (idea_id, user_id))`.

Grants (001/002): `anon` nichts (außer 003). `authenticated`: select schools/events/profiles; update profiles nur `(first_name, grade, avatar_color, interests)`; event_registrations select/insert/delete + update **nur `status`** (002); ideas select/insert/delete; idea_supports select/insert/delete; execute `get_idea_support_counts`.

### 4.2 Policies (Stand live nach 004 v3, vor 006)

| Tabelle | Policy | Bedingung |
|---|---|---|
| schools | lesen für Angemeldete / öffentliche Infos für Besucher (003) | `true` |
| events | `events: lesen für Angemeldete` | `true` (006 ersetzt durch Erlaubnisliste) |
| profiles | eigenes Profil lesen / bearbeiten | `id = auth.uid()` |
| event_registrations | eigene lesen/anlegen/ändern/löschen | `user_id = auth.uid()`; anlegen nur wenn Event `planned/confirmed` und `start_at > now()` |
| ideas | `ideas: lesen (freigegeben oder eigene)` | `status in ('collecting','review','planned') or author_id = auth.uid()` |
| ideas | eigene anlegen / löschen | anlegen: eigene ID, `status='submitted'`, eigene Schule aus `profiles` |
| idea_supports | eigene lesen / löschen; `supports: eigene anlegen` | anlegen: eigene ID **und** Idee fremd **und** Status `collecting/review/planned` |

`get_idea_support_counts()` (004 v3): security definer, zählt nur Unterstützungen sichtbarer Ideen
(Erlaubnisliste oder eigene), gibt nur `(idea_id, supporters)` aus.

**Moderationsregel fürs Team:** neue Ideen sind `submitted` (nur Autor:in sieht sie). Freigeben =
`collecting`. `review` = „Schulen prüfen die Umsetzung“ und ist **öffentlich** – nicht zum
Moderieren verwenden.

### 4.3 Migration 005 (live)

- `public.admins(user_id uuid pk → auth.users(id) on delete cascade, created_at timestamptz not null default now(), note text check (note is null or char_length(note) <= 200))`; RLS an, **keine Policy**, `revoke all from public, anon, authenticated`.
- `public.is_admin()` → boolean, `language sql stable security definer set search_path = ''`, Körper `select exists (select 1 from public.admins a where a.user_id = (select auth.uid()));`; execute nur `authenticated`.
- Admins werden **nur im SQL Editor** zugewiesen/entzogen (Skripte B/C aus dem Chat: genau ein Konto per `lower(email)`, bestätigt, Profil vorhanden, `begin…commit`).

### 4.4 Migration 006 (fertig, nicht ausgeführt) – Inhalt

Grundprinzip: Admins handeln **nur über `admin_*()`-Funktionen** (security definer, `search_path=''`,
prüfen zuerst `is_admin()` → sonst `42501`). **Keine** neuen Tabellenrechte für Schüler:innen,
**keine** Admin-Policies → normale App sieht für Admins gleich aus.

1. `events.status` + `'draft'`, Standard `'draft'`. Alte Prüfregel wird nur gelöscht, wenn sie zeichengenau der Regel aus 001 entspricht (Vergleich über temporäre Referenztabellen `_006_ref_*`, `on commit drop`); sonst Abbruch.
2. Events-Lese-Policy → `events: lesen (veröffentlicht)` = `status in ('planned','confirmed','completed','cancelled')`.
3. `ideas.status` + `'rejected'` (privat durch Erlaubnisliste aus 004 v3).
4. Trigger `event_registrations_guard` (BEFORE INSERT OR UPDATE, Funktion `event_registration_guard()`, security definer, VOLATILE):
   - INSERT oder UPDATE **zu** `registered`: Event muss existieren, `planned/confirmed`, Zukunft; bei `registered` zusätzlich **Plätze** (`capacity`) prüfen.
   - `registered → interested` unverändert erlaubt; `event_id`/`user_id` ändern verboten.
   - Sperre `FOR NO KEY UPDATE` auf der Event-Zeile; Admin-Funktionen sperren `FOR UPDATE`.
   - **Nur READ COMMITTED** (sonst `DC009`). Begründung: Unter REPEATABLE READ würde die Zählung nach dem Warten eine alte Sicht nutzen → Überbuchung möglich.
5. Interne Funktionen (für niemanden über API aufrufbar): `admin_is_valid_text_json(jsonb,int,bool)`, `admin_trim_text_json(jsonb)`, `admin_assert_event_input(...)`. Texte `{de,tr,en}` oder String, getrimmt 1..max (Titel 120, Summary 300, Beschreibung 2000, Ort/Zielgruppe 200), gespeichert getrimmt. Schulen: existierend, keine Duplikate/NULL, Gastgeber beteiligt. Themen: Erlaubnisliste = `src/data/topics.js`.
6. Event-Funktionen: `admin_list_events()` (inkl. Entwürfe, Zählungen ohne Namen), `admin_create_event(...)` (immer `draft`), `admin_update_event(...)` (Status/Anmeldungen bleiben; Datum: veröffentlicht nur in Zukunft verschiebbar, abgesagt/abgeschlossen fest; Plätze nie unter Anmeldezahl), `admin_set_event_status(id, status)`, `admin_delete_event(id)` (nur leere Entwürfe).
   - Übergänge: `draft→planned|confirmed` (Datum Zukunft), `planned→confirmed|cancelled|completed`, `confirmed→cancelled|completed`, `cancelled`/`completed` endgültig, **nie zurück zu draft**, gleicher Status = No-op, `completed` erst nach Beginn.
7. Ideen-Funktionen: `admin_list_ideas(status)` (ohne `author_id`, mit Unterstützerzahl), `admin_set_idea_status(id, status)`.
   - Übergänge: `submitted→collecting|rejected`, `collecting→review|rejected`, `review→planned|collecting|rejected`, `rejected→submitted` (Wiedereröffnen zur Prüfung), `planned` endgültig.
8. Selbstprüfung (Teil 9, Abbruch = alles zurück): Spalten/Defaults/Checks/PK/FK exakt wie 001 (inkl. PK `events(id)`); vollständiger Policy-Satz (11 Policies, auch keine restriktiven Zusatz-Policies), jede Policy zeichengenau gegen Vergleichs-Policy; `get_idea_support_counts` = v3; keine neuen Rechte für `anon`/`authenticated`; Admin-Funktionen (definer, Eigentümer, EXECUTE); READ-COMMITTED-Pflicht; interne Funktionen gesperrt; Eigentümer-Rechte + RLS-Bypass + Praxisprobe `row_security=off`; Trigger exakt; **005 vollständig verifiziert** (Tabelle, Constraints, RLS, Rechte, `is_admin`-Körper).

Fehlercodes (für das Frontend):

| Code | Bedeutung |
|---|---|
| `42501` | nicht erlaubt / kein Admin / Anmeldung nicht möglich |
| `22023` | ungültige Eingabe |
| `P0002` | nicht gefunden |
| `DC001` | Event hat Einträge (Löschen) |
| `DC002` | Datum in der Vergangenheit |
| `DC003` | nur Entwürfe löschbar |
| `DC004` | Statuswechsel nicht erlaubt |
| `DC005` | Plätze unter Anmeldezahl |
| `DC006` | Datum abgesagter/abgeschlossener Events fest |
| `DC007` | Event hat noch nicht begonnen (abschließen) |
| `DC008` | ausgebucht |
| `DC009` | falsche Isolationsstufe |

---

## 5. Tests und Prüf-Skripte (`supabase/tests/`)

| Datei | Art | Hinweis |
|---|---|---|
| `ideas_rls_test.sql` | Rollback-Test (16 Fälle) für 004 | unklar, ob live ausgeführt |
| `admin_role_test.sql` | Rollback-Test (11 Fälle) für 005 | unklar, ob live ausgeführt |
| `admin_functions_test.sql` | Rollback-Test (>100 Prüfungen) für 006 | **auf einer Kopie** ausführen, braucht 006 |
| `006_readonly_checks.sql` | R1–R10, **nur lesend** | gefahrlos live, vor und nach 006 |
| `capacity_concurrency_manual.sql` | K1–K5, zwei psql-Sitzungen | **nur Kopie** (lokal `supabase start` / Staging) |
| `006_testplan.md` | Testplan in 3 Stufen | Stufe 1 live, Stufe 2+3 auf Kopie |
| `../seed_test_events.sql` | zwei „[Test]“-Events | optional, setzt Status explizit |

Rollback-Tests: ein `do`-Block, simuliert Konten über `set_config('request.jwt.claim.sub'/'request.jwt.claims')` + `set local role authenticated`, endet immer mit `raise exception 'TESTERGEBNIS…'` (nichts bleibt gespeichert). E-Mail-Platzhalter `EMAIL_KONTO_A`/`EMAIL_KONTO_B`.

---

## 6. Sicherheitsentscheidungen (begründet)

- Publishable Key im Browser ist ok; Sicherheit liegt in RLS. Secret/Service-Role-Key nie im Frontend.
- Registrierung zusätzlich im Dashboard sperrbar (der Env-Schalter blendet nur das Formular aus).
- Datensparsamkeit: kein Nachname; Ideen anderer zeigen nur die Schule; Admin-Listen ohne Personen-IDs/E-Mail.
- Erlaubnislisten statt Ausschlusslisten (neue Status bleiben automatisch privat).
- Admin-Rechte nur über eigene Tabelle `admins` (nicht `user_metadata`, keine E-Mail im Code).
- Admin-Lesen nur über Funktionen, damit die normale App für Admins unverändert bleibt.
- Veröffentlichte Events werden abgesagt, nie gelöscht (Anmeldungen bleiben).
- Kapazität wird ab 006 auch für Schüler:innen erzwungen (`DC008`) – frühere Pilot-Entscheidung „keine Platzzählung“ damit aufgehoben (auf Wunsch des Teams).
- Gleichzeitigkeit nur unter READ COMMITTED garantiert; andere Stufen scheitern sicher (`DC009`).

---

## 7. Offene Punkte (in dieser Reihenfolge angehen)

1. **006 auf einer Kopie testen**, dann erst live: Stufe 2 + 3 aus `006_testplan.md`. Vorher live `006_readonly_checks.sql` (nur lesend).
2. **`004_ideas_moderation.sql` im Repo auf v3 bringen** (Erlaubnisliste in Lese-Policy, `supports: eigene anlegen` mit Status-Erlaubnisliste, `get_idea_support_counts` mit Erlaubnisliste, Selbstprüfung). 006 prüft live gegen **v3**; ist live doch v1, bricht 006 ab.
3. **Frontend vor dem ersten Einsatz von 006 anpassen**: Status-Texte `draft` und `rejected` (de/tr/en, `StatusBadge`, Schrittanzeige), Fehlercodes `DC001`–`DC009` in `eventsApi.registrationErrorKey` / Admin-UI. Bis dahin **keine Idee ablehnen, keine Entwürfe anlegen**.
4. **Admin-Frontend `/admin` bauen** (Phase 1 geplant, noch kein Code): `useIsAdmin` (RPC `is_admin`), `AdminRoute`, `AdminLayout`, Seiten Übersicht/Events/Event-Formular/Ideen, `src/lib/adminApi.js`, Lazy-Loading, Admin-Link nur wenn `is_admin()` wahr. Zeitzone im Event-Formular explizit Ankara (+03:00) behandeln.
5. **Nächste Migration (geplant, nicht geschrieben):** `admin_dashboard_stats()` und `admin_list_users()` (ohne E-Mail), danach Schulverwaltung – vorher entscheiden, wie die doppelte Schul-Pflege (`src/data/schools.js` vs. Tabelle) aufgelöst wird.
6. Noch nicht vorhanden: Audit-Log für Admin-Aktionen, Rückweg-SQL für 006, Sperr-Trigger für Ideen-Unterstützungen (bewusst weggelassen).
7. Supabase: Registrierung nach Tests wieder schließen; `VITE_ENABLE_SIGNUP=false`.
8. Committen: Änderungen sind lokal und untracked; Commit-Strategie mit dem Team klären.
9. Bekannte Kleinigkeiten: Ladebildschirm blitzt beim Start kurz auf; Fehler beim Unterstützen auf Ideen-Karten nur für Screenreader sichtbar; Übersetzungen TR/EN von Muttersprachler:innen prüfen lassen; Designreferenzen liegen unter `design references/` statt `docs/design-references/`.

Im Browser bereits erfolgreich getestet (laut Team): Registrierung, E-Mail-Bestätigung, Login,
Profil, Events laden/anmelden/abmelden mit Persistenz, Ideen einreichen/freigeben/unterstützen/
Unterstützung entfernen mit zwei Konten.

---

## 8. In diesen Sitzungen geänderte oder neue Dateien

**Neu:**
`src/auth/AuthContext.jsx`, `src/lib/authValidation.js`, `src/lib/accountProfile.js`,
`src/lib/eventsApi.js`, `src/lib/ideasApi.js`, `src/state/useAccountEvents.js`,
`src/state/useAccountIdeas.js`, `src/pages/LoginPage.jsx`, `src/pages/RegisterPage.jsx`,
`src/components/AccountCard.jsx`, `src/components/ProfileGate.jsx`,
`tests/authValidation.test.js`, `tests/accountProfile.test.js`, `tests/eventsApi.test.js`,
`tests/ideasApi.test.js`,
`supabase/migrations/002_restrict_registration_update.sql`, `003_public_school_info.sql`,
`004_ideas_moderation.sql` (v1!), `005_admin_role.sql`, `006_admin_events_ideas.sql`,
`supabase/tests/ideas_rls_test.sql`, `admin_role_test.sql`, `admin_functions_test.sql`,
`006_readonly_checks.sql`, `capacity_concurrency_manual.sql`, `006_testplan.md`,
`docs/HANDOFF.md`.

**Geändert:**
`src/main.jsx`, `src/App.jsx`, `src/lib/supabaseClient.js`, `src/state/AppStateContext.jsx`,
`src/pages/{MePage,SettingsPage,InterestsPage,EventsPage,EventDetailPage,HomePage,SchoolDetailPage,IdeasPage,IdeaDetailPage,NewIdeaPage}.jsx`,
`src/components/{ProfileMenu,ProfileSwitcher,SupportButton,SchoolCard}.jsx`,
`src/components/layout/{SideNav,TopBar}.jsx`, `src/styles/base.css`,
`src/locales/{de,tr,en}.json`, `.env.example`, `README.md` (Abschnitt 22.3a).

**Unverändert:** `supabase/migrations/001_initial_schema.sql`, `supabase/seed_test_events.sql`,
Demo-Daten in `src/data/`.
