# DeutschConnect – Übergabe 2 (Admin-Dashboard, Archivierung, Status-Anzeige)

> **NEU (2026-11-09): Die Integration Claude + Codex läuft auf Branch `integration-v1`.**
> Zuerst lesen: [`docs/FINAL_INTEGRATION_PLAN.md`](FINAL_INTEGRATION_PLAN.md) (Architektur, Entscheidungen, Rollback)
> und [`docs/INTEGRATION_PROGRESS.md`](INTEGRATION_PROGRESS.md) (erledigte Stufen, Tests, offene Punkte).
> Seitdem gilt: Navigation = 5 Codex-Bereiche (Seitenleiste entfernt), neue Migration `011_tutoring.sql`
> (**nicht ausgeführt**), `npm test` = 293 Tests. Der Rest dieser Datei beschreibt den Stand vor der Integration.

Stand: **2026-11-08** · Branch: **`claude-version-1.0`** · Hauptbranch: `main`
Letzter Commit: `9121665 Create HANDOFF.md` – **alles danach ist lokal und NICHT committet** (Liste in Abschnitt 14).

**Integrationsdokumente (für die Zusammenführung mit Kerems Codex-Version):**
[`docs/CLAUDE_INTEGRATION_BLUEPRINT.md`](CLAUDE_INTEGRATION_BLUEPRINT.md) (vollständige technische Referenz, 33 Abschnitte + Anhänge)
und [`docs/integration/CLAUDE_INTEGRATION_MANIFEST.json`](integration/CLAUDE_INTEGRATION_MANIFEST.json) (maschinenlesbar).

Diese Datei ersetzt `docs/HANDOFF.md` **nicht**, sondern ergänzt sie. Die alte Datei ist in Teilen
veraltet (sie sagt z. B. „006 nicht ausgeführt“ und „Admin-Frontend nicht gebaut“). Bei Widersprüchen
gilt diese Datei. Vor jeder Arbeit außerdem `README.md` und `AGENTS.md` lesen.

---

## 0. Das Wichtigste in 10 Zeilen

1. React 19 + Vite 6 + react-router 7 + Supabase (Auth, Postgres, RLS). Mobil zuerst, Deutsch/Türkisch/Englisch.
2. Abgemeldet = Demo-Daten; angemeldet = echte Supabase-Daten. Kein stiller Rückfall auf Demo.
3. Admin-Bereich `/admin` ist fertig: Übersicht, Events (zwei Spalten), Ideen-Moderation inkl. Löschen.
4. Admins handeln **nur über `admin_*`-RPCs** (SECURITY DEFINER, prüfen `is_admin()`), nie direkt auf Tabellen.
5. Migrationen **001–006 laut Team live**. **007–010 liegen nur lokal** – ob sie inzwischen ausgeführt wurden, ist **unbekannt → vor DB-Arbeit fragen**.
6. Events werden **archiviert, nie gelöscht** (24 h nach Absage bzw. Ende), stündlich per `pg_cron` (Migration 009).
7. Schüler:innen sehen Event-Status und eigene Anmeldung **getrennt**; abgesagte Events bleiben 24 h sichtbar.
8. `npm test` = **267/267 grün**, `npm run build` erfolgreich. **Kein Browser-Test** dieser Arbeiten durchgeführt.
9. Nichts committet, nichts gepusht. Commit/Push/Merge/Live-SQL **nur nach ausdrücklicher Freigabe**.
10. Merge mit `origin/codex-version-1.0` ist **kein Datei-Merge** möglich (völlig andere Architektur) – Abschnitt 16.

---

## 1. Arbeitsregeln (Kurzfassung aus AGENTS.md + Erfahrungen)

- Erst Repo prüfen, kleinste nötige Änderung, keine großen Abhängigkeiten ohne Begründung.
- **Nie** SQL ausführen, Live-DB ändern, Migrationen anwenden, committen, pushen oder mergen ohne ausdrückliche Freigabe.
- Secrets nie in Dateien; nur Publishable Key im Browser. Keine E-Mails/Passwörter im Code.
- Antworten auf **Deutsch**, englische Fachbegriffe erlaubt; Projektinhaber lernt noch → wichtige Begriffe kurz erklären.
- Klar trennen: funktioniert / Demo / geplant. Nie behaupten, etwas sei im Browser getestet, wenn nicht.
- Am Ende jeder Aufgabe: geändert, Dateien, Checks, was geht, was offen ist, nächste Schritte.
- Der Nutzer möchte **keine Auswahl-Dialoge** für Designfragen: empfohlene Variante umsetzen und Annahmen im Bericht nennen.
- Der Nutzer bittet oft um „gib mir den SQL für 0XX“ – dann den ausführbaren Code (ohne langen Erklärkopf) in einem Block liefern, identisch zur Datei.

---

## 2. Umgebung

| Bereich | Stand |
|---|---|
| Frontend | React 19, Vite 6, `react-router` 7, eigenes i18n (`src/i18n`, `src/locales/{de,tr,en}.json`) |
| Backend | Supabase (Auth + Postgres + RLS + pg_cron ab 009), `@supabase/supabase-js` 2.119 |
| Tests | `npm test` = `node --test` über `tests/*.test.js` → **267 Tests, alle grün** |
| Build | `npm run build` ok; Warnung „Chunk > 500 kB“ (Haupt-Bundle ~692 kB) bestand schon vorher |
| Lint/Typecheck | im Projekt nicht vorhanden |
| Env | `.env.local` (git-ignoriert, nie committet): `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_…`), `VITE_ENABLE_SIGNUP` |
| Hinweis Env | In `.env.local` steht aktuell **`VITE_ENABLE_SIGNUP=true`** – laut Plan nach Tests wieder auf `false` und im Supabase-Dashboard Registrierung schließen |
| Dev-Server | `npm run dev` → Port 5173 (Supabase-Redirect hängt daran) |
| Git unter Windows | `git` ist im Bash-Tool verfügbar; laut alter Übergabe sonst `%LOCALAPPDATA%\GitHubDesktop\app-3.6.10\resources\app\git\cmd\git.exe` |
| Zeilenenden | `.gitattributes: * text=auto` → Warnungen „LF will be replaced by CRLF“ sind harmlos |

Test-Konten (echt, nur fiktive Inhalte; E-Mails stehen bewusst in keiner Datei):
- **Konto A** – Pilot-Admin (Eintrag in `public.admins`, Notiz „Pilot-Admin“), Vorname „Ege“. Nicht ändern.
- **Konto B** – normale:r Schüler:in (Gmail-Plus-Adresse „+test2“).

Hilfreich für Prüfungen ohne Browser: Seiten lassen sich mit Vite serverseitig rendern (virtuelles
Vite-Modul, das React/Router/Seite gemeinsam lädt; `envDir` auf einen leeren Ordner setzen, sonst lädt
Vite `.env.local` und die App zeigt nur den Ladebildschirm). Skripte lagen im Scratchpad, nicht im Repo.

---

## 3. Frontend-Architektur

```
main.jsx
 └ BrowserRouter
    └ LanguageProvider          src/i18n/LanguageContext.jsx
       └ AuthProvider            src/auth/AuthContext.jsx        (Sitzung, Profil, signIn/Up/Out)
          └ AppStateProvider     src/state/AppStateContext.jsx   (zentrale Daten, mode)
             └ AdminStatusProvider  src/state/AdminStatusContext.jsx  (useIsAdmin)
                └ App               src/App.jsx  (alle Routen in AppShell)
```

### 3.1 Modi (`useAppState().mode`)
| Modus | Wann | Daten |
|---|---|---|
| `demo` | abgemeldet / Supabase nicht konfiguriert | `src/data/*.js` + localStorage `deutschconnect.demoState` |
| `loading` / `error` | Sitzung, Profil, Events, Ideen laden bzw. fehlgeschlagen | `ProfileGate` (Lade-/Fehlerbildschirm, kein Demo-Rückfall) |
| `account` | angemeldet, alles geladen | Supabase |

Im Konto-Modus werden Events **zentral** über `visibleToStudents(accountEvents.events, now)` gefiltert
(`src/lib/eventArchive.js`, `now` tickt alle 5 Min.). Dadurch verschwinden archivierte Events überall
(Listen, „Meine“, Startseite, Schulen, Empfehlungen, Detailseite über `getEvent`). Anmeldungen
(`accountEvents.registrations`) bleiben unverändert.

### 3.2 Routen
Schüler:innen: `/`, `/events`, `/events/:eventId`, `/ideas`, `/ideas/new`, `/ideas/:ideaId`, `/network`,
`/network/schools/:schoolId`, `/network/projects/:projectId`, `/me`, `/me/interests`, `/me/settings`,
`/login`, `/register`, `/about`, `*`.

Admin (alle **lazy** geladen, nur innerhalb `AdminRoute`):
| Route | Seite |
|---|---|
| `/admin` | `AdminOverviewPage` (Kennzahlen, Schnellzugriff, Aktivitäten) |
| `/admin/events` | `AdminEventsPage` (Spalten Geplant/Abgesagt, Filter `?status=`) |
| `/admin/events/new` | `AdminEventFormPage` (neu, immer Entwurf) |
| `/admin/events/:eventId/edit` | `AdminEventFormPage` (bearbeiten, alle Felder) |
| `/admin/ideas` | `AdminIdeasPage` (Moderation, Filter `?status=`) |
| `/admin/*` | NotFound |

### 3.3 Admin-Zugriff (nur Anzeige – Sicherheit liegt in der DB)
- `AdminStatusContext` ruft `fetchIsAdmin` (RPC `is_admin`) **nur bei `mode === 'account'`** und nur einmal pro Konto-ID;
  Ergebnis nur im Arbeitsspeicher (nie localStorage); Kontowechsel/Logout → sofort verworfen.
- `resolveAdminAccess` (`src/lib/adminAccess.js`): abgemeldet/Demo → `login` (Redirect `/login`, danach zurück via
  `safeRedirectPath`), Laden → `loading`, Fehler → `error` (fail-closed), kein Admin → `denied`, Admin → `allowed`.
- Admin-Link nur sichtbar, wenn `is_admin() = true`: Seitenleiste (Desktop), Profilmenü (Smartphone).

### 3.4 Wichtige Dateien

| Datei | Zweck |
|---|---|
| `src/lib/supabaseClient.js` | einziger Supabase-Client; blockiert `sb_secret_`/`service_role`-Keys |
| `src/lib/eventsApi.js` | Events + eigene Anmeldungen laden; `EVENT_COLUMNS` (inkl. `cancelled_at, archived_at`), Rückfall auf `EVENT_COLUMNS_BASE` bei `42703` (008 fehlt); `registrationErrorKey` (DC008 voll, DC009 technisch) |
| `src/lib/ideasApi.js` | Ideen, Unterstützungen, `get_idea_support_counts` |
| `src/lib/selectors.js` | `isUpcoming` (Empfehlungen/Zählungen, ohne Absagen), `isListed` (Listen, inkl. Absagen), `isPast` (inkl. vergangener Absagen), `getMyEvents`, `filterEvents` (mit `status`: all/scheduled/cancelled), `countEventsByStatusFilter`, `getUpdates` (keine Erinnerung für Absagen) |
| `src/lib/eventArchive.js` | Frontend-Archivregeln (identisch zu DB): `eventEndsAt`, `studentArchiveDueAt`, `isArchivedForStudents`, `visibleToStudents` |
| `src/lib/ideaProgress.js` | Fortschrittsanzeige Ideen-Detail (inkl. `rejected`) + Hinweis „Nicht freigegeben“ |
| `src/lib/adminApi.js` | **alle** Admin-RPC-Wrapper + `adminErrorKey` (Fehlercode → i18n) |
| `src/lib/adminAccess.js` | `deriveAdminStatus`, `resolveAdminAccess` |
| `src/lib/adminEvents.js` | Statuswechsel (Kopie der DB-Regeln), Filter, Kennzahlen, Löschen, Speichern, **Gruppen/Spalten** (`EVENT_GROUPS`, `eventGroupOf`, `groupEventsForFilter`) |
| `src/lib/adminIdeas.js` | Moderations-Wechsel, Filter, Löschen (`IDEA_DELETABLE_STATUSES`, `removeIdea`, `resolveIdeaConfirmation`) |
| `src/lib/adminOverview.js` | Übersicht: Kennzahl-Karten, Schnellzugriff, `loadOverviewStats`, `buildRecentActivity`, `loadRecentActivity` |
| `src/lib/eventForm.js` | Event-Formular: Ankara-Zeit (fest UTC+3), Umwandlung Formular↔Event, Validierung, `formatAnkaraDateTime` |
| `src/state/AdminStatusContext.jsx` | `useIsAdmin()` |
| `src/components/admin/*` | `AdminRoute`, `AdminLayout`, `AdminEventCard`, `AdminIdeaCard`, `LocalizedTextField` |
| `src/pages/admin/*` | `AdminOverviewPage`, `AdminEventsPage`, `AdminEventFormPage`, `AdminIdeasPage` (`AdminPlaceholder.jsx` wurde entfernt) |
| `src/components/EventCard.jsx` | Schüler-Karte: **Status immer** + Teilnahme getrennt („Event:“ / „Du:“), Absage rot mit Datum |
| `src/pages/EventsPage.jsx` | Tab „Alle“ mit Status-Filter „Alle | Geplant | Abgesagt“ (`?status=`) |
| `src/pages/EventDetailPage.jsx` | Absage-Hinweis mit Datum + „Deine Teilnahme bleibt gespeichert“; keine Anmeldeknöpfe bei Absage |

---

## 4. Datenbank-Schema (nach 001–010)

- `schools(id text pk, name, short_name, city, partnership_status, created_at)` – Daten `ers`, `anka`.
- `profiles(id uuid pk → auth.users cascade, first_name 1–40, school_id → schools, grade 5–13, avatar_color, interests text[] ≤20, created_at, updated_at)`; Trigger `handle_new_user` legt Profil bei Registrierung an (auch vor E-Mail-Bestätigung).
- `events(id uuid pk, title jsonb not null, summary/description/location/audience jsonb, start_at timestamptz not null, duration_minutes int >0 (Formular/DB-Funktion: 1–1440), capacity int >0 (1–10000), online bool, topics text[], format (workshop|meetup|discussion|competition|online|project), host_school_id → schools, school_ids text[] ≥1, status, created_at, **cancelled_at timestamptz (008)**, **archived_at timestamptz (008)**)`
  - Status-Check (006): `draft | planned | confirmed | completed | cancelled`, Default `draft`.
  - 008: `events_cancelled_at_matches_status`: `(status = 'cancelled') = (cancelled_at is not null)`; `events_archived_only_published`: `archived_at` nur bei planned/confirmed/completed/cancelled; Index `events_archived_at_idx`.
- `event_registrations(event_id → events cascade, user_id → profiles cascade, status registered|interested, created_at, pk(event_id,user_id))`; Update nur Spalte `status` (002). Trigger `event_registrations_guard` (006): nur planned/confirmed + Zukunft; bei `registered` Kapazität (`DC008`); nur READ COMMITTED (`DC009`).
- `ideas(id, author_id → profiles, school_id, title 5–80, summary ≤200, description 20–600, topics 1–3, format, school_ids, status, created_at)`; Status (006): `submitted | collecting | review | planned | rejected`.
- `idea_supports(idea_id → ideas **on delete cascade**, user_id → profiles cascade, created_at, pk)`.
- `admins(user_id pk → auth.users cascade, created_at, note ≤200)`; RLS an, **keine Policy**, keine Rechte für anon/authenticated (005).

### 4.1 Policies (Soll-Stand nach 008)
| Tabelle | Policy | Bedingung |
|---|---|---|
| schools | lesen (Angemeldete) / öffentliche Infos (anon, nur id,name,short_name,city – 003) | `true` |
| events | **`events: lesen (veröffentlicht, nicht archiviert)`** (008, ersetzt die 006-Policy) | `status in (planned,confirmed,completed,cancelled) and archived_at is null` |
| profiles | eigenes lesen/bearbeiten | `id = auth.uid()` |
| event_registrations | `registrations: eigene lesen/anlegen/ändern/löschen` | `user_id = auth.uid()`; anlegen nur planned/confirmed + Zukunft |
| ideas | `ideas: lesen (freigegeben oder eigene)` (004 **v3 live**) | Erlaubnisliste `collecting/review/planned` oder eigene |
| ideas | `ideas: eigene anlegen` / `ideas: eigene löschen` | eigene ID, `submitted`, eigene Schule / `author_id = auth.uid()` |
| idea_supports | eigene lesen/löschen; `supports: eigene anlegen` | eigene ID, fremde Idee, Status in Erlaubnisliste |
| admins | keine | – |

**Achtung:** `supabase/migrations/004_ideas_moderation.sql` im Repo enthält noch **v1** (Ausschlussliste
`status <> 'submitted'`); live ist **v3** (Erlaubnisliste). Datei nie erneut ausführen, ohne sie auf v3 zu bringen –
sonst wären abgelehnte Ideen öffentlich.

### 4.2 Datenbank-Funktionen (RPCs)

| Funktion | Migration | Aufrufbar | Zweck / Regeln |
|---|---|---|---|
| `is_admin()` → bool | 005 | authenticated | prüft `public.admins` für `auth.uid()` |
| `get_idea_support_counts()` | 001/004 v3 | authenticated | nur Zahlen sichtbarer Ideen |
| `admin_list_events()` | 006, **neu in 008** | authenticated (+is_admin) | alle Events inkl. Entwürfe + `registered_count`, `interested_count`; ab 008 zusätzlich `cancelled_at`, `archived_at` (Funktion wird gedroppt + neu angelegt) |
| `admin_create_event(p_title, p_start_at, p_host_school_id, p_school_ids, p_summary?, p_description?, p_location?, p_audience?, p_duration_minutes?, p_capacity?, p_online?, p_topics?, p_format?)` → uuid | 006 | authenticated | immer `draft` |
| `admin_update_event(p_id, …13 Felder…)` | 006, **ersetzt in 008** | authenticated | überschreibt ALLE Felder; DC006/DC002/DC005; ab 008: bei geändertem Datum **oder Dauer** (planned/confirmed/completed) `archived_at` sofort neu berechnet; cancelled unverändert |
| `admin_set_event_status(p_id, p_status)` | 006, **ersetzt in 008** | authenticated | Wechsel siehe 5.1; ab 008 setzt `cancelled_at = now()` beim Absagen |
| `admin_delete_event(p_id)` | 006 | authenticated | nur leere Entwürfe (DC003/DC001) |
| `admin_list_ideas(p_status?)` | 006 | authenticated | ohne `author_id`, mit `supporters` |
| `admin_set_idea_status(p_id, p_status)` | 006 | authenticated | Wechsel siehe 5.2 |
| `admin_delete_idea(p_id)` | **007** | authenticated | nur collecting/review/planned/rejected (sonst DC010); löscht erst `idea_supports`, dann Idee; FOR UPDATE |
| `event_ends_at(start, duration)` | **008** | **niemand** (nur Eigentümer) | Ende = Start + Dauer; ohne Dauer: Mitternacht nach Starttag in Europe/Istanbul |
| `archive_finished_events()` → int | **008** | **niemand** (nur Eigentümer/Cron) | setzt `archived_at = now()`: cancelled 24 h nach `cancelled_at`; planned/confirmed/completed 24 h nach Ende; nie draft; idempotent |
| `admin_get_overview_stats()` | **010** | authenticated (+is_admin) | eine Zeile: `total_students` (Profile ohne Admins), `upcoming_events`, `total_registrations` (nur registered, alle Events), `ideas_pending_review` (submitted), `archived_events` (NULL, wenn 008 fehlt) |
| interne 006-Helfer `admin_is_valid_text_json`, `admin_trim_text_json`, `admin_assert_event_input`, Trigger-Fkt. `event_registration_guard` | 006 | niemand | Validierung (Texte de/tr/en, Längen 120/300/2000/200/200, Schulen, Themen-Erlaubnisliste = `src/data/topics.js`) |

Muster aller Admin-Funktionen: `SECURITY DEFINER`, `set search_path = ''`, voll qualifizierte Namen,
erste Zeile `if not public.is_admin() then raise … errcode '42501'`. EXECUTE: Eigentümer, `authenticated`,
`service_role` (Supabase-Standard); nicht `PUBLIC`/`anon`. Interne Funktionen (008) zusätzlich nicht `service_role`.

### 4.3 Fehlercodes

| Code | Bedeutung | i18n-Schlüssel |
|---|---|---|
| `42501` | nicht erlaubt / kein Admin / Anmeldung nicht möglich | `admin.errors.notAllowed` / `eventDetail.errors.closed` |
| `22023` | ungültige Eingabe | `admin.errors.invalid` |
| `P0002` | nicht gefunden | `admin.errors.notFound` |
| `DC001` | Event hat Einträge (Löschen) | `hasEntries` |
| `DC002` | Datum in der Vergangenheit | `pastDate` |
| `DC003` | nur Entwürfe löschbar | `onlyDrafts` |
| `DC004` | Statuswechsel nicht erlaubt | `transition` |
| `DC005` | Plätze unter Anmeldezahl | `capacityTooLow` |
| `DC006` | Datum abgesagter/abgeschlossener Events fest | `dateLocked` |
| `DC007` | Event hat noch nicht begonnen (abschließen) | `notStarted` |
| `DC008` | ausgebucht | `full` / `eventDetail.errors.full` |
| `DC009` | falsche Isolationsstufe (nur READ COMMITTED) | `technical` |
| `DC010` | Idee in diesem Status nicht löschbar (007) | `ideaNotDeletable` |
| `PGRST202` / `42883` | Funktion fehlt (Migration nicht ausgeführt) | `unavailable` / Übersicht „nicht verfügbar“ |
| `42703` | Spalte fehlt (008 nicht ausgeführt) | `fetchEvents` lädt ohne neue Spalten |
| `23514`, `23503`, `22P02` | Prüfregel/Fremdschlüssel/Format | `invalid` |

---

## 5. Lebenszyklen

### 5.1 Events
- Wechsel (`admin_set_event_status`): `draft → planned|confirmed` (Datum Zukunft, DC002), `planned → confirmed|cancelled|completed`, `confirmed → cancelled|completed`; `cancelled`/`completed` endgültig; nie zurück zu `draft`; `completed` erst nach Beginn (DC007).
- Löschen nur leere Entwürfe; veröffentlichte Events werden **abgesagt**, nie gelöscht.
- **Archivierung (008/009)** – eigener Zustand neben dem Status:
  - cancelled → 24 h nach `cancelled_at`
  - planned/confirmed/completed → 24 h nach Ende (Start + Dauer; ohne Dauer Mitternacht Ankara)
  - draft, künftige und laufende Events nie
  - DB archiviert stündlich (`pg_cron`, Minute 7); Frontend blendet minutengenau aus (gleiche Regeln)
  - Schüler:innen sehen archivierte Events nirgends (RLS + Frontend); Admins sehen alles (`admin_list_events`)
  - Altbestand: bei 008 bekommen bereits abgesagte Events `cancelled_at = Zeitpunkt der Migration`; erster Cron-Lauf archiviert alles, was länger als 24 h vorbei ist

### 5.2 Ideen
- `submitted → collecting` (freigeben) | `rejected`; `collecting → review | rejected`; `review → planned | collecting | rejected`; `rejected → submitted` (wiedereröffnen); `planned` endgültig.
- `review` ist **öffentlich** (Schulen prüfen Umsetzung) – nicht zum Moderieren benutzen.
- Admin-Löschen (007) nur nach Moderation (nicht `submitted`); Unterstützungen werden mitgelöscht. Schüler:innen dürfen weiterhin eigene Ideen löschen (001).
- Eigene abgelehnte Idee: Detailseite zeigt „Nicht freigegeben“, Fortschritt nur „Eingereicht ✓ → Nicht freigegeben ✕“.

---

## 6. Migrationen – Status

| Nr. | Datei | Inhalt | Status |
|---|---|---|---|
| 001 | `001_initial_schema.sql` | Tabellen, Trigger, Grants, RLS | **live** |
| 002 | `002_restrict_registration_update.sql` | Anmeldung: Update nur `status` | **live** |
| 003 | `003_public_school_info.sql` | anon liest Schul-Basisdaten | **live** |
| 004 | `004_ideas_moderation.sql` | Ideen-Moderation | **live als v3**, Repo-Datei = **v1** (veraltet!) |
| 005 | `005_admin_role.sql` | `admins`, `is_admin()` | **live**, Konto A eingetragen |
| 006 | `006_admin_events_ideas.sql` | Admin-Funktionen, Entwürfe, Trigger, Kapazität | **live** (laut Team) |
| 007 | `007_admin_delete_idea.sql` | `admin_delete_idea` | **lokal** – Nutzer wollte sie ausführen, **Ergebnis unbekannt** |
| 008 | `008_event_archiving.sql` | `cancelled_at`, `archived_at`, Archiv-Funktion, Policy verschärft, Admin-Fkt. ersetzt, Laufzeit-Probe | **lokal**, Status unbekannt |
| 009 | `009_event_archiving_cron.sql` | `pg_cron`-Job `dc_archive_finished_events` (`7 * * * *`) | **lokal**, Status unbekannt |
| 010 | `010_admin_overview_stats.sql` | `admin_get_overview_stats` (unabhängig von 008) | **lokal**, Status unbekannt |

Empfohlene Reihenfolge: **007 → 008 → 009 → 010** (010 darf auch vor 008). Immer als `postgres` im SQL Editor,
ganze Datei, erwartete Meldung „Success“; jede Migration ist eine Transaktion mit Selbstprüfung
(`ABBRUCH: …` = nichts geändert). Nach 008 würde ein **erneutes** Ausführen von 006 sicher abbrechen (gewollt).

Selbstprüfungen von 008 (nach Review K1–K7): Eigentümer = Tabellen-Eigentümer, App-Rollen (anon,
authenticated, service_role, authenticator) nicht Mitglied, SELECT/UPDATE-Rechte, FORCE RLS aus,
Erlaubnislisten der EXECUTE-Rechte, Policy exakt gegen Vergleichs-Policy (temporäre Tabelle), Laufzeit-Probe
mit 9 Probe-Events (danach per Subtransaktion zurückgerollt), `pg_depend`-Check vor dem Drop von
`admin_list_events`, Rückgabe-Spalten. 009 prüft: Job genau einmal, aktuelle Datenbank, Rolle = Eigentümer
der Funktion, darf sie ausführen. **Mögliche Fehlalarme:** falls `authenticator` Mitglied von `postgres` ist
oder Admin-Funktionen manuell weitere Rechte haben – Abbruch ist dann sicher, Meldung prüfen.

### 6.1 SQL-Tests (`supabase/tests/`) – nur auf einer **Kopie** ausführen
| Datei | Für | Hinweis |
|---|---|---|
| `ideas_rls_test.sql` | 004 | Rollback-Test |
| `admin_role_test.sql` | 005 | Rollback-Test |
| `admin_functions_test.sql` | 006 | >100 Prüfungen, Rollback |
| `006_readonly_checks.sql`, `006_testplan.md`, `capacity_concurrency_manual.sql` | 006 | lesend / zwei Sitzungen |
| `admin_delete_idea_test.sql` | 007 | 11 Prüfungen |
| `event_archiving_test.sql` | 008 | T1–T21 (inkl. Dauer-Änderung) |
Alle Rollback-Tests: `EMAIL_KONTO_A`/`EMAIL_KONTO_B` eintragen; enden immer mit `ERROR: TESTERGEBNIS …` (= zurückgerollt).

---

## 7. Sicherheitsentscheidungen (begründet)

- Publishable Key im Browser ist ok; Sicherheit liegt in RLS. Service-Role-Key nie im Frontend (Client blockiert ihn).
- Admin-Rechte nur über `public.admins` (nicht `user_metadata`, keine E-Mail im Code); Zuweisung nur im SQL Editor.
- Admins handeln ausschließlich über `admin_*`-RPCs; **keine Admin-Policies** → normale App sieht für Admins gleich aus (auch Admins sehen archivierte Events nur im Admin-Bereich).
- Frontend-Schutz (`AdminRoute`, Admin-Link) ist nur Komfort; fail-closed bei Fehlern; Admin-Seiten lazy (Schüler:innen laden den Code nicht).
- Erlaubnislisten statt Ausschlusslisten (neue Status bleiben automatisch privat/nicht löschbar/nicht archiviert).
- Datensparsamkeit: kein Nachname; Admin-Listen ohne Personen-IDs/E-Mails; Übersicht nur Zahlen.
- Archivieren statt löschen; Anmeldungen bleiben immer erhalten. Interne Archiv-Funktion für keine App-Rolle aufrufbar.
- Statusregeln, Längen, Themen stehen **doppelt** (DB = maßgeblich, Frontend = Komfort/Fehlermeldungen); Tests prüfen Gleichheit.
- Zeit-Regeln (DC002/DC007) prüft nur die DB (Browser-Uhr darf nichts entscheiden); Archiv-Ausblendung im Frontend ist zusätzlich.
- Login-Weiterleitung nur auf interne Pfade (`safeRedirectPath`, kein Open Redirect).

---

## 8. Admin-Dashboard – Funktionen

- **Übersicht `/admin`**: Begrüßung („Willkommen im DeutschConnect Admin-Dashboard“, „Angemeldet als {Vorname} · {Datum}“); 5 Kennzahl-Karten (2 pro Reihe, ab 1200 px 5); Schnellzugriff (Neues Event, Events verwalten, eingereichte Ideen prüfen, alle Ideen); Aktivitäten = 5 neueste angelegte Events/eingereichte Ideen aus `admin_list_events`/`admin_list_ideas` (ausdrücklich **kein** Protokoll). Unabhängige Lade-/Fehlerzustände; unbekannte Werte „–“, nie 0; ohne 010 Hinweis; ohne 008 „Archiviert: erst nach Migration 008“.
- **Events `/admin/events`**: 6 Kennzahlen, Filter (Alle, 5 Status, Archiviert); **zwei Spalten** „Geplante Events“ (planned+confirmed, nicht archiviert) | „Abgesagte Events“ (cancelled, nicht archiviert); darunter Entwürfe, Abgeschlossen, Archiviert (nur mit Inhalt); jedes Event genau einmal. Karte: Datum (Ankara), Gastgeber, Ort, Format/online, Status, Anmeldungen/Interessierte/Plätze, „Abgesagt am …“, Badge „Archiviert“; Aktionen mit Bestätigung; Entwurf löschen nur leer.
- **Event-Formular**: Texte de/tr/en (`LocalizedTextField`), Datum in Ankara-Zeit (`+03:00`), Dauer, **Maximale Teilnehmerzahl** (leer = unbegrenzt, nicht unter Anmeldezahl), Online, Format, Schulen (aus `src/data/schools.js`), Gastgeber, Zielgruppe, Themen. Bearbeiten lädt und sendet **alle** Felder; Datum gesperrt bei cancelled/completed.
- **Ideen `/admin/ideas`**: Übersicht (wartend/sammeln/prüfung), Filter, Karten ohne Autor:in, Moderations-Wechsel mit Bestätigung, „Idee löschen“ (nicht bei submitted), Doppelklick-Schutz.

## 9. Schüler:innen – Event-Status (zuletzt umgesetzt)

- Events-Seite, Tab „Alle“: Status-Filter **Alle | Geplant | Abgesagt** mit Zahlen (`?status=all|scheduled|cancelled`), wirkt mit Suche/Zeitraum/Schule/Thema/Format; „Abgesagt + Demnächst“ zeigt alle noch sichtbaren Absagen, auch mit vergangenem Original-Datum.
- `EventCard`: Status immer sichtbar; bei eigener Rolle zusätzlich „Event: … / Du: …“; Absage rot mit „Abgesagt am … – findet nicht statt“.
- Detailseite: Absage-Hinweis + Datum + „Deine Teilnahme bleibt gespeichert: Angemeldet“; keine Anmeldeknöpfe.
- Status-Text `planned` heißt jetzt überall **„Geplant“** (tr „Planlandı“, en „Planned“) – auch im Admin-Bereich.

---

## 10. Tests (`tests/`, 267 grün)

`accountProfile`, `authValidation`, `eventsApi`, `ideasApi`, `selectors`, `i18n` (Schlüssel-Parität, keine leeren
Texte, alle im Code genutzten Schlüssel; dynamische Status-Schlüssel inkl. `draft`/`rejected` explizit),
`ideaProgress`, `adminApi`, `adminAccess`, `adminIdeas`, `adminIdeaDelete`, `adminEvents`, `adminEventGroups`,
`eventForm`, `eventArchive` (inkl. statischer Prüfung 008/009), `adminOverview` (inkl. statischer Prüfung 010),
`studentEventStatus`. Konvention: nachgebauter Supabase-Client (`rpc`; `from()` wirft im Admin-Kontext),
statische Quelltext-Prüfungen für Sicherheitsregeln, Übersetzungs-Prüfungen pro Feature.

---

## 11. Offene Punkte / bekannte Probleme

1. **Live-Status von 007–010 unbekannt** → vor jeder DB-Arbeit fragen; dann in dieser Datei nachtragen.
2. **Kein Browser-Test** der Admin- und Status-Funktionen (Konto A/B, Smartphone/Tablet/Desktop). Klick-Listen: siehe Abschnitt 13.
3. `004_ideas_moderation.sql` im Repo auf **v3** bringen (live = v3).
4. `docs/HANDOFF.md` veraltet (diese Datei ergänzt sie).
5. `.env.local`: `VITE_ENABLE_SIGNUP=true` → nach Tests `false`; Supabase-Registrierung schließen.
6. Schüler-Zahl zählt auch Profile unbestätigter Konten (Profil entsteht bei Registrierung).
7. Kein Audit-Log für Admin-Aktionen; kein Rückweg-SQL für 006–010; keine Benachrichtigung bei Absagen.
8. Bearbeiten durch zwei Admins gleichzeitig: letzte Speicherung gewinnt.
9. Ankara fest als UTC+3 (`ANKARA_UTC_OFFSET` in `eventForm.js`, `ANKARA_OFFSET_MS` in `eventArchive.js`; DB nutzt `Europe/Istanbul`).
10. Erfolgsmeldung nach Speichern eines Events kann nach Seiten-Reload erneut erscheinen (`location.state`).
11. Fokus springt bei lazy geladenen Seiten nicht immer auf die Überschrift.
12. Aktivitäten der Übersicht laden komplette Event-/Ideen-Listen (für Pilot ok).
13. Doppelte Pflege Schulen (`src/data/schools.js` vs. Tabelle `schools`) und Themen (`topics.js` vs. 006).
14. Haupt-Bundle > 500 kB (Warnung, vorbestehend).
15. TR/EN-Texte von Muttersprachler:innen prüfen lassen.
16. Admin-Übersicht `/admin`: keine Nutzerverwaltung, bewusst kein Link auf Schüler:innen.

---

## 12. Nächste Schritte (Vorschlag, jeweils nur mit Freigabe)

1. Klären, welche Migrationen live sind; ggf. 007 → 008 → 009 → 010 ausführen (vorher auf Kopie mit den SQL-Tests).
2. Browser-Tests mit Konto A/B (Abschnitt 13).
3. Committen auf `claude-version-1.0` (Commit-Strategie mit Team klären).
4. `004`-Datei auf v3, `docs/HANDOFF.md` aktualisieren/zusammenführen.
5. Merge-Strategie mit `codex-version-1.0` festlegen (Abschnitt 16).

## 13. Browser-Prüfliste (noch offen)

- Abgemeldet `/admin` → Login → zurück zu `/admin` (Konto A). Konto B `/admin` → „Kein Zugriff“, keine `Admin*.js` im Netzwerk-Tab.
- Ideen: B reicht ein → A gibt frei/lehnt ab/öffnet wieder/löscht (nach 007) → Sicht von B prüfen (abgelehnt: „Nicht freigegeben“).
- Events: anlegen (Entwurf, B sieht nichts) → veröffentlichen → B meldet sich an → Zahlen im Admin → bearbeiten (alle Felder bleiben, Uhrzeit für B korrekt) → Teilnehmerzahl unter Anmeldungen (DC005) → absagen (Spalte wechselt; B sieht „Event: Abgesagt / Du: Angemeldet“, Filter „Abgesagt“) → nach 24 h/Cron für B weg, Admin „Archiviert“.
- Übersicht: Zahlen plausibel, alle Links. Responsive: Smartphone/Tablet/Desktop, kein waagerechter Überlauf, iOS-Datumsfeld.
- Nach 009: `select jobname, schedule, username, database, active from cron.job;` → eine Zeile `dc_archive_finished_events`.

---

## 14. Geänderte Dateien seit Commit `9121665` (alle lokal, nicht committet)

**Geändert (25):**
`src/App.jsx`, `src/main.jsx`, `src/components/Badges.jsx`, `src/components/EventCard.jsx`,
`src/components/Icon.jsx` (Icon `shield`), `src/components/ProfileMenu.jsx`, `src/components/layout/SideNav.jsx`,
`src/lib/authValidation.js` (`safeRedirectPath`), `src/lib/eventsApi.js`, `src/lib/selectors.js`,
`src/locales/de.json`, `src/locales/en.json`, `src/locales/tr.json`, `src/pages/EventDetailPage.jsx`,
`src/pages/EventsPage.jsx`, `src/pages/IdeaDetailPage.jsx`, `src/pages/LoginPage.jsx`,
`src/pages/SchoolDetailPage.jsx`, `src/state/AppStateContext.jsx`, `src/styles/components.css`,
`src/styles/pages.css`, `tests/authValidation.test.js`, `tests/eventsApi.test.js`, `tests/i18n.test.js`,
`tests/selectors.test.js`.

**Neu (36):**
- `src/components/admin/`: `AdminEventCard.jsx`, `AdminIdeaCard.jsx`, `AdminLayout.jsx`, `AdminRoute.jsx`, `LocalizedTextField.jsx`
- `src/lib/`: `adminAccess.js`, `adminApi.js`, `adminEvents.js`, `adminIdeas.js`, `adminOverview.js`, `eventArchive.js`, `eventForm.js`, `ideaProgress.js`
- `src/pages/admin/`: `AdminEventFormPage.jsx`, `AdminEventsPage.jsx`, `AdminIdeasPage.jsx`, `AdminOverviewPage.jsx`
- `src/state/AdminStatusContext.jsx`
- `supabase/migrations/`: `007_admin_delete_idea.sql`, `008_event_archiving.sql`, `009_event_archiving_cron.sql`, `010_admin_overview_stats.sql`
- `supabase/tests/`: `admin_delete_idea_test.sql`, `event_archiving_test.sql`
- `tests/`: `adminAccess`, `adminApi`, `adminEventGroups`, `adminEvents`, `adminIdeaDelete`, `adminIdeas`, `adminOverview`, `eventArchive`, `eventForm`, `ideaProgress`, `studentEventStatus` (jeweils `.test.js`)
- `docs/HANDOFF-2.md` (diese Datei)

**Unverändert:** Migrationen 001–006, `supabase/seed_test_events.sql`, Demo-Daten `src/data/`, README, AGENTS.

---

## 15. Übersetzungen (Struktur)

Neue/erweiterte Bereiche in allen drei Sprachen: `nav.admin`; `admin.*` (`badge`, `navLabel`, `nav`, `loading`,
`denied`, `statusError`, `saving`, `actionsLabel`, `refresh`, `filtersLabel`, `overview.*`, `events.*` inkl.
`groups.*`, `eventForm.*`, `ideas.*`, `errors.*`); `status.event.draft`, `status.idea.rejected`;
`events.statusFilter.*`, `events.card.*`, `events.noCancelled*`; `eventDetail.errors.full|technical`,
`eventDetail.cancelledOn`, `eventDetail.cancelledRegistrationKept`; `ideaDetail.steps.rejected`, `ideaDetail.rejectedText`.
JSON-Format = `JSON.stringify(…, null, 2) + "\n"` (Skripte zum Einfügen können die Dateien so neu schreiben).

---

## 16. Merge mit `origin/codex-version-1.0`

Gemeinsame Basis `23a6a0a`. Codex-Version ist **anders aufgebaut**: kein `react-router`, kein `@supabase/supabase-js`,
eigene Navigation/Module (Tutoring, Spiele, Community, Moderation.jsx), Backend als generischer JSON-Speicher
(`dc_workspace`/`dc_commands` + Edge Function `supabase/functions/platform`, Migration `202611070001_platform.sql`),
Tests unter `scripts/*.test.mjs`.

Beide ändern: `src/App.jsx`, `src/main.jsx`, `package.json`, `package-lock.json`, `vite.config.js`,
`src/locales/{de,en,tr}.json`, `src/i18n/LanguageContext.jsx`, `EventCard`, `IdeaCard`, `SchoolCard`, `Icon`,
`README.md`, `.env.example`, `index.html`, `public/favicon.svg`.

Empfehlung: **diese Version als Basis** (live laufendes relationales Schema mit RLS, echte Konten, Admin-Bereich)
und Funktionen der Codex-Version einzeln portieren. Zwei Datenmodelle parallel vermeiden. Entscheidung liegt beim Team.
