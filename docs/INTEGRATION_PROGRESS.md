# DeutschConnect – Integrationsfortschritt

Plan: [FINAL_INTEGRATION_PLAN.md](FINAL_INTEGRATION_PLAN.md) · Branch `integration-v1` · lokale Commits: Stufen 1–4
(`a7b50a3`), Stufe 5 (`c15bfdf`), Stufe 6 (`fc0b9d7`), Doku (`68f58e7`) · **nichts gepusht** (4 Commits vor `origin`),
nichts veröffentlicht. **Alles ab Sitzung 8 ist NICHT committet** (Stand 2026-11-10: 42 geänderte, 5 gelöschte, 85 neue
Dateien – Aufteilungsvorschlag: Sitzung 30).

**Staging** (`DeutschConnect-Staging`, laut Ege, 2026-11-09): **001–007, 010, 011, 012, 013 erfolgreich ausgeführt** ·
008 und 009 bewusst ausgelassen · `admin_get_overview_stats()` vorhanden, Admin-Statistik funktioniert (von Ege geprüft).
**Nicht erneut ausführen.**
Laut Ege (2026-11-10, **von Claude nicht geprüft**): zusätzlich **014** (Chat) und **020** (Lesestand) ausgeführt.
Welche 014-Fassung dort läuft, ist unbestätigt. 017, 018, 019 sind nicht ausgeführt.

**Live** (laut Ege, 2026-11-09, unverändert): 001–007 ausgeführt · 008, 009, 010 nicht ausgeführt · 011–013 nicht ausgeführt.
Alle weitere Arbeit nur gegen Staging.

> **Stand 011–013:** Auf Staging ausgeführt, die eingebauten Selbstprüfungen sind durchgelaufen (sonst wäre die Datei
> zurückgerollt worden). Die **Funktionstests** mit Testkonten (T1–T6, P1–P4, J1–J5 im
> [STAGING_RUNBOOK.md](STAGING_RUNBOOK.md)) sind noch **nicht** durchgeführt; `staging_verify.sql` wurde mir noch
> nicht zurückgemeldet.

### Teststand je Modul (drei getrennte Ebenen)

Lokal = Code + `npm test` + Build + Render-Test (Demo). DB = gegen eine echte Supabase-Datenbank (Staging).
Browser = von Hand im Browser mit echten Konten bedient.

| Modul | Lokal umgesetzt | DB-getestet | Browser-getestet |
|---|---|---|---|
| Design, Navigation, Startseite (Stufen 2–3) | ✔ | – (keine DB nötig) | ✘ |
| Nachhilfe (011) | ✔ | ◐ Migration auf Staging gelaufen; Funktionstests T1–T6 offen | ✘ |
| Profile, Freigaben, Statistik (012) | ✔ | ◐ Migration auf Staging gelaufen; Funktionstests P1–P4 offen | ✘ |
| Projekt-Mitwirkung (013) | ✔ | ◐ Migration auf Staging gelaufen; Funktionstests J1–J5 offen | ✘ |
| Admin-Kennzahlen (010) | ✔ (Claude-Bestand) | ✔ Staging (Ege: Funktion vorhanden, Statistik funktioniert) | ✔ Staging (laut Ege) |
| Staging-Modus (`check:staging`, `dev:staging`) | ✔ | ✔ Verbindung zum echten Staging-Projekt (Auth + Data API erreichbar, 2026-11-09) | ✘ (Kennzeichnung nur im ausgelieferten Code geprüft, nicht im Browser angesehen) |
| Bestehende Claude-Funktionen (Auth, Events, Ideen, Admin; 001–007) | unverändert | ✔ live (laut Team) | ✔ live (laut Team) |
| Spiele (nur Browser) + Bestenlisten (017) | ✔ | ✘ Staging · lokal ✔ (Wegwerf-PostgreSQL, 017-Test) | ✘ (nur Headless-Chrome) |
| Chat (014) + Lesestand (020) | ✔ | ✘ Staging-Tests offen (014/020 laut Ege ausgeführt) · lokal ✔ | ✘ (nur Headless-Chrome gegen lokale DB) |
| Community-Gruppen + Admin-Freigabe der Gruppenerstellung | ✔ | ✘ Staging · lokal ✔ (`014_group_approval_test.sql` 16/16) | ✘ (nur Headless-Chrome gegen lokale DB) |
| Events automatisch löschen (018/019) | ✔ | ✘ Staging · lokal ✔ (018-Test, pg_cron nur nachgebildet) | – |
| Design: Akzentfarben, Creme, 2px-Rahmen, Flaggen-Logo, Startseite schwarz | ✔ | – (keine DB nötig) | ✘ (nur Headless-Chrome, 1280 + 390 px) |
| Netzwerk-Bereich entfernt (`/network/*` → `/discover`) | ✔ | – | ✘ (nur Headless-Chrome) |

„Headless-Chrome“ = automatisierter Browser ohne Bildschirm (Screenshots + DOM-Prüfung), kein Test mit echten Konten.

Legende: ✔ erledigt und lokal geprüft · ◐ Code fertig, Live-Abnahme offen · ○ offen

| Stufe | Inhalt | Stand |
|---|---|---|
| 1 | Claude-Backend + Auth als Basis | ✔ unverändert (AuthContext, AppStateContext, Admin, Migrationen 001–010) |
| 2 | Codex-Design + Hauptnavigation | ✔ |
| 3 | Codex-Startseite/Dashboard | ✔ |
| 4 | Nachhilfe-Börse | ◐ 011 auf Staging ausgeführt; Funktionstests offen; live nicht ausgeführt |
| 5 | Profile + Statistiken | ◐ 012 auf Staging ausgeführt; Funktionstests offen; live nicht ausgeführt |
| 6 | Projekte (Anträge/Mitglieder), Events-Optik, Gruppen | ◐ Mitwirkung: 013 auf Staging ausgeführt, Tests offen; Abschluss → Stufe 7; Projekt-/Eventgruppen = Chat-Räume aus 014, sichtbar unter `/community/groups`, Anlegen erst nach Admin-Freigabe (Sitzungen 27, 29) – nur lokal getestet |
| 7 | Admin für neue Module, 24-h-Ausblendung abgelehnter Ideen | ○ Plan steht (unten, Sitzung 5) |
| 8 | Spiele + Bestenlisten | ◐ 8a: alle vier Spiele im Browser (eigener Bereich /games); 8b: Bestenlisten Papierflug + Brückenläufer gebaut, Migration 017 noch NICHT auf Staging ausgeführt |
| 9 | Inkonsistenzen beheben | ○ (bekannte Punkte: Sitzung 30, „Offen“) |
| 10 | Mehrbenutzer-Gesamttest | ○ |

---

## Sitzung 2026-11-09 – Stufen 1–4

### Geändert / neu

| Datei | Änderung |
|---|---|
| `src/styles/variables.css` | Farb-/Radius-/Schrift-Werte aus Codex `global.css`, Variablennamen unverändert |
| `src/styles/base.css` | Überschriften-Typografie wie Codex (h1 clamp 1.65–2.25 rem) |
| `src/styles/layout.css` | Codex-Kopfleiste, schwebende Bottom-Nav, Desktop-Navigation ab 1050 px, Fußzeile; Seitenleiste entfernt |
| `src/styles/modules.css` (neu) | Codex-Muster: Begrüßungskarte, task-card, Hub-Karten, Unter-Navigation, Nachhilfe |
| `src/components/layout/navigation.js` | 5 Codex-Bereiche + `sectionForPath()` |
| `src/components/layout/MainNav.jsx` (neu), `BottomNav.jsx`, `TopBar.jsx`, `AppShell.jsx` | eine Navigation für unten/oben; Admin + Konto über Profilmenü; „Über“ in Fußzeile |
| `src/components/layout/SideNav.jsx` | **gelöscht** (ersetzt durch Kopfleisten-Navigation) |
| `src/components/SectionNav.jsx` (neu) | Unter-Navigation „Entdecken“ (Übersicht/Events/Ideen/Netzwerk) |
| `src/pages/DiscoverPage.jsx`, `CommunityPage.jsx` (neu) | Bereichsseiten; Community zeigt nicht fertige Module ehrlich als „In Integration“ ohne Knöpfe |
| `src/pages/EventsPage.jsx`, `IdeasPage.jsx`, `NetworkPage.jsx` | nur `SectionNav` ergänzt |
| `src/pages/HomePage.jsx`, `src/components/QuickActions.jsx` | Codex-Begrüßungskarte, Nachhilfe-Vorschläge, Schnellzugriff auf neue Bereiche |
| `supabase/migrations/011_tutoring.sql` (neu) | Nachhilfe-Backend (siehe unten) |
| `src/lib/tutoring.js`, `src/lib/tutoringApi.js`, `src/data/tutoring.js`, `src/state/TutoringContext.jsx` (neu) | Regeln, Supabase-Zugriff, Demo-Daten, Zustand |
| `src/components/tutoring/*`, `src/pages/Tutoring*Page.jsx` (neu) | Liste mit Tabs/Filtern, Formular, Detail mit Anfragen |
| `src/App.jsx`, `src/main.jsx` | Routen `/discover`, `/tutoring…`, `/community`; `TutoringProvider` |
| `src/lib/format.js` | `formatDateShort()` |
| `src/locales/{de,tr,en}.json` | alle neuen Texte in drei Sprachen (Nachhilfe-Texte aus Codex übernommen) |
| `tests/navigation.test.js`, `tests/tutoring.test.js` (neu) | 26 neue Tests |

### Nachhilfe – was wie funktioniert

| Funktion | Umsetzung | Echt / Demo |
|---|---|---|
| Angebot/Gesuch erstellen, bearbeiten | `insert/update tutoring_entries` (RLS: nur eigene, eigene Schule) | echt (nach 011) |
| Schließen/Wiederöffnen, Löschen | `update status` / `delete` (RLS) | echt (nach 011) |
| Suchen, Filtern (Fach, Sprache, Format) | `filterTutoringEntries` (Fächer sprachübergreifend vereinheitlicht) | lokal über geladene Daten |
| Passende Partner finden | `matchTutoring` (gegenteilige Art, gleiches Fach, gemeinsame Sprache) auf der Startseite | lokal über geladene Daten |
| Interesse/Merken | `tutoring_saves` (nur für einen selbst) | echt (nach 011) |
| Anfrage senden | RPC `tutoring_send_request` – geht wirklich an die erstellende Person | echt (nach 011) |
| Anfragen empfangen | Tab „Anfragen“ + Detailseite + Zähler auf Startseite; Neuladen beim Öffnen und bei Fensterwechsel | echt, **kein Push/Realtime** |
| Annehmen/Ablehnen mit Notiz, Zurückziehen | RPCs `tutoring_respond_request`, `tutoring_withdraw_request` (Statusregeln in der DB) | echt (nach 011) |
| Profil der Person öffnen | **noch nicht** – kommt mit Stufe 5 (freiwillige Profile) | offen |
| Abgemeldet | 4 fiktive Einträge, nur lesen, deutlich als Demo markiert | Demo |

Datenschutz: Listen zeigen Schule, keinen Namen. Absender:in gibt mit der Anfrage den eigenen Vornamen frei; den
Vornamen der erstellenden Person sieht man erst nach Annahme. E-Mail/Link/Telefonnummer werden in Frontend **und**
Datenbank abgelehnt (`dc_has_contact_data`). Keine Chats – nur Nachricht + kurze Antwortnotiz.

Ersetzt den Codex-„Kontaktentwurf“, der nur im Browser gespeichert und nie zugestellt wurde.

### Durchgeführte Prüfungen

| Prüfung | Ergebnis |
|---|---|
| `npm test` | **293/293 grün** (vorher 267; +26 neue, keine bestehenden geändert) |
| `npm run build` | erfolgreich; bekannte Warnung Chunk > 500 kB (vorher ~692 kB, jetzt ~764 kB) |
| i18n-Test | alle Schlüssel in DE/TR/EN vorhanden, keine leeren Texte |
| Render-Smoke-Test (Vite-SSR, Demo-Modus, Skript im Scratchpad, nicht im Repo) | 18 Routen fehlerfrei gerendert: `/`, `/discover`, `/events`, `/ideas`, `/network`, `/community`, `/tutoring` (+Tabs), Detail, Neu, Bearbeiten, unbekannte ID → „nicht gefunden“, `/me`, `/about`, `/admin` (→ Login) |

**Nicht geprüft:** Browser-Bedienung (Klicks, Layout auf echtem Handy), Konto-Modus, Migration 011 gegen eine
Datenbank (kein lokales PostgreSQL vorhanden – SQL ist nur gelesen, nicht ausgeführt), Zwei-Konten-Ablauf.

### Bekannte Grenzen / offene Punkte

1. **011 ausführen** (nach Freigabe, erst Staging): Danach Zwei-Konten-Test: A erstellt Angebot → B findet, merkt, fragt
   an → A sieht Anfrage, nimmt an → beide laden neu und sehen „Angenommen“; Negativtest: B kann A's Eintrag nicht ändern.
2. Keine Admin-Moderation für Nachhilfe (Stufe 7).
3. Anfrage-Zustellung ohne Push/E-Mail – sichtbar beim nächsten Laden.
4. Löschen eines Eintrags löscht auch dessen Anfragen (cascade) – bewusst einfach; ggf. später „nur schließen“.
5. Codex-„Initiativen“ (statische Team-Vorschläge mit lokalem Interesse) nicht übernommen, weil sie keine echte
   Funktion hatten.
6. Bundle wächst; Code-Splitting der Seiten (wie beim Admin-Bereich) später sinnvoll.

### Nächste Schritte

1. Ege bestätigt Live-Stand 007–010 und gibt 011 für Staging frei → Zwei-Konten-Test Nachhilfe.
2. Stufe 5: Migration 012 (freiwillige Profilfreigaben + Statistik-RPCs), Seite `/community/people/:id`,
   Statistiken in „Mein Bereich“; Profil-Link in Nachhilfe-Anfragen.
3. Danach Stufe 6–8 gemäß Plan.

---

## Sitzung 2026-11-09 (2) – Review 011, Commit, Stufe 5

### Review Migration 011 (vor Staging)

| Prüfpunkt | Ergebnis |
|---|---|
| Abhängigkeiten | Nur 001 (`profiles`, `schools`) + `auth.uid()`. **Keine** Abhängigkeit von 005–010 (kein `is_admin()`, kein `archived_at`, kein pg_cron). Neuer Teil 0 bricht ab, wenn 001 fehlt → läuft mit dem Live-Stand (008–010 fehlen). |
| Eigentümer | Tabellen + Funktionen gehören der ausführenden Rolle (`postgres` im SQL Editor). RLS gilt für alle anderen Rollen. |
| RLS | auf allen 3 Tabellen aktiv; Einträge: lesen aktive/eigene, schreiben nur eigene (Schule = eigene Schule); Merken: nur eigene. |
| **Verschärft** | `tutoring_entries` direkt nur noch Spalte `id` lesbar (vorher alle Spalten → fremde `owner_id` sichtbar). Gelesen wird nur über `tutoring_list_entries()`. |
| **Verschärft** | `tutoring_requests`: gar kein direkter Zugriff mehr (vorher `select` + Policy). Alles über Funktionen. |
| **Verschärft** | Anlegen nur mit festen Spalten – `created_at`, `updated_at`, `status` setzt die Datenbank (vorher hätte man `created_at` fälschen können). |
| SECURITY DEFINER | 5 Funktionen, alle `search_path = ''`, nur voll qualifizierte Namen, prüfen `auth.uid()`, `execute` nur `authenticated` (nicht PUBLIC/anon). |
| Ergänzt | `tutoring_list_requests()` liefert `other_profile_id` (nur wo der Vorname ohnehin sichtbar ist) für den Profil-Link aus Stufe 5. |
| Selbstprüfung | erweitert: keine Rechte auf `tutoring_requests`, `owner_id`/`description` nicht direkt lesbar, `created_at`/`status` nicht einfügbar, Funktionen sind SECURITY DEFINER. |
| Bekannt / akzeptiert | `dc_has_contact_data()` ist für alle ausführbar (reine Textprüfung ohne Datenzugriff). Kein Spam-Limit für Einträge (Pilot klein; Admin-Moderation Stufe 7). |

**Staging-Test – noch NICHT durchgeführt.** In dieser Umgebung gibt es kein Staging-Projekt mit Zugangsdaten
(`.env.local` zeigt auf das Live-Projekt und wird bewusst nicht benutzt). Ablauf, sobald ein separates Projekt da ist:

1. Neues Supabase-Projekt anlegen (nicht das Live-Projekt), dort 001 → 007, dann 011 (und 012) ausführen.
2. App lokal mit den Staging-Werten starten (eigene Datei, z. B. `.env.staging.local`, nicht committen).
3. Konto A (ERS) erstellt Angebot · Konto B (Anka) findet es, sendet Anfrage · A sieht Anfrage, nimmt an ·
   beide laden neu: A sieht „Angenommen“, B sieht „Angenommen“ + Vorname von A.
4. Negativtests: B kann den Eintrag von A nicht ändern/löschen; abgemeldet ist nichts lesbar; B sieht in der Liste keinen Namen.
5. Nur mit echter Datenbank prüfbar: Ändern/Löschen eigener Einträge mit der Spaltenfreigabe `select (id)`.
   Falls das scheitert, ist der Rückfall `grant select on public.tutoring_entries to authenticated` (wie vorher).

### Stufe 5 – Profile + Statistiken

| Datei | Änderung |
|---|---|
| `supabase/migrations/012_profiles_stats.sql` (neu) | `profile_sharing` (privat als Standard), `get_my_activity_stats()`, `list_public_profiles()`, `get_public_profile(uuid)`; braucht nur 001, Nachhilfe-Zahlen optional (011) |
| `src/lib/profiles.js`, `src/lib/profilesApi.js` (neu) | Regeln, Umwandlung, Supabase-Zugriff |
| `src/data/publicProfiles.js` (neu) | fiktive Demo-Profile mit unterschiedlichen Freigaben |
| `src/state/useProfiles.js` (neu) | Hooks `useMyStats`, `useMySharing`, `usePublicProfiles`, `usePublicProfile` (demo/loading/ready/error/notInstalled) |
| `src/components/profiles/*` (neu) | Statushinweis, Statistik-Gruppen |
| `src/pages/PeoplePage.jsx`, `PublicProfilePage.jsx`, `ProfileSharingPage.jsx` (neu) | `/community/people`, `/community/people/:id`, `/me/sharing` |
| `src/pages/MePage.jsx` | Abschnitt „Meine Aktivität“ (echte Zahlen), Zeile „Profil-Freigabe“ |
| `src/pages/CommunityPage.jsx` | Karte „Schülerprofile“; Gruppen + Spiele weiter „In Integration“ |
| `src/components/tutoring/RequestCard.jsx`, `src/lib/tutoring.js` | Link „Profil ansehen“ |
| `src/App.jsx`, `src/styles/modules.css`, `src/locales/*` | Routen, Stile, Texte DE/TR/EN; Registrierungs-Hinweis zum Vornamen korrigiert |
| `tests/profiles.test.js` (neu) | 13 Tests (Freigaben, Statistik, Demo-Datenschutz, API, SQL-Regeln, Navigation) |

| Funktion | Echt / Demo |
|---|---|
| Privates persönliches Profil + eigene Statistik (Events, Ideen, Unterstützungen, Nachhilfe) | echt nach 012 (Nachhilfe-Zahlen „–“, solange 011 fehlt) |
| Freiwilliges öffentliches Profil (Vorname + einzeln: Schule, Interessen, Projektvorschläge, Aktivität) | echt nach 012 |
| Verzeichnis, Profilseite, Vorschau des eigenen Profils | echt nach 012 |
| Projektvorschläge im Profil | echt (veröffentlichte eigene Ideen) |
| Projekt-**Mitgliedschaften** | **noch nicht** – keine Tabelle; Stufe 6 (Migration 013) |
| Abgemeldet | fiktive Profile, nur lesen |

Datenschutz: Standard privat · nur angemeldete Schüler:innen sehen freigegebene Profile · Klasse/E-Mail nie ·
privat und „gibt es nicht“ sind von außen nicht unterscheidbar · Tabelle `profiles` bleibt unverändert privat.
„Teilgenommen“ = angemeldet und Event vorbei; eine Anwesenheit wird nicht erfasst (steht so in der App).

### Prüfungen

| Prüfung | Ergebnis |
|---|---|
| `npm test` | **306/306 grün** (+13) |
| `npm run build` | erfolgreich; bekannte Warnung Chunk > 500 kB |
| Render-Smoke-Test (Demo) | 14 Routen fehlerfrei, u. a. `/me`, `/me/sharing`, `/community/people`, Profil öffentlich/teilweise/privat/unbekannt |

**Nicht geprüft:** 011 und 012 gegen eine Datenbank, Konto-Modus, Browser-Bedienung.

### Nächste Schritte

1. Staging-Projekt bereitstellen → 011 + 012 dort ausführen → Zwei-Konten-Test (oben) + Profil-Test
   (A gibt Profil frei, B sieht es; A nimmt Freigabe zurück, B sieht „nicht verfügbar“).
2. Stufe 5 lokal committen (nach Freigabe).
3. Stufe 6: Projekt-Mitgliedschaften (013); Gruppenbeiträge bleiben aus.

---

## Sitzung 2026-11-09 (3) – Staging-Vorbereitung, 004 auf v3, zweite Review

### Branch-Klärung
Es gibt **keinen** Branch „Integrieren“ (weder lokal noch auf GitHub). Der einzige Integrations-Branch ist
`integration-v1` (lokal 1–2 Commits voraus, nicht gepusht). „Integrieren“ war die Beschreibung, kein Branch-Name.

### Befund Migration 004 (wichtig für Staging)
Die Repo-Datei war **v1** (`status <> 'submitted'`), live ist **v3** (Erlaubnisliste `collecting/review/planned`).
Folgen auf einer frischen Datenbank mit v1: (a) 006 bricht in seiner Selbstprüfung ab (prüft zeichengenau gegen v3);
(b) ohne 006-Abbruch wären abgelehnte Ideen für alle sichtbar. → Datei auf **v3** gebracht, Ausdrücke identisch zu
`expected_policies`/`counts_body` in 006, eigene Selbstprüfung. Neuer Test `tests/migrations.test.js` vergleicht
004 automatisch mit 006. Erneutes Ausführen auf Live wäre jetzt harmlos (identisches Ergebnis) – trotzdem nicht nötig.

### Zweite Review 012 – Korrektur
Speichern der Freigaben lief als REST-Upsert. PostgREST setzt dabei auch `user_id` im UPDATE-Teil → hätte mit 42501
geendet (Spalte bewusst nicht änderbar). Jetzt: Funktion `save_profile_sharing(...)` (SECURITY DEFINER, schreibt
immer die Zeile von `auth.uid()`), **keine** insert/update/delete-Rechte mehr auf `profile_sharing`.
Selbstprüfung entsprechend erweitert.

### Staging-Zugang (isoliert)
- `.env.staging.local` steht in `.gitignore` (plus allgemein `.env.*.local`).
- `npm run check:staging` prüft die Datei, ohne Keys auszugeben: URL + publishable Key vorhanden, kein secret/
  service_role Key, keine Passwort-/DB-Variablen, **Host ≠ Host aus `.env.local`**.
- `npm run dev:staging` startet nur nach bestandener Prüfung; **`.env.local` wird in diesem Modus nicht geladen**
  (`vite.config.js`: leeres `envDir` + geprüfte Werte). Oben rechts erscheint „STAGING“.
- Geprüft mit einer fiktiven Datei: Staging-Host im Bundle ✔, Live-Host im Bundle ✘, Start ohne Datei bricht ab ✔.

### Ablauf auf Staging (Ege führt SQL im Dashboard des STAGING-Projekts aus)
1. `npm run check:staging` → muss „OK“ und den Staging-Host zeigen.
2. SQL Editor von **DeutschConnect-Staging**, jede Datei komplett: 001, 002, 003, **004 (v3)**, 005, 006, 007, 011, 012.
   008–010 werden nicht gebraucht (Test `migrations.test.js`).
3. Zwei Testkonten anlegen (A = ERS, B = Anka Bilim), nur fiktive Inhalte. Für die Registrierung in der Staging-Datei
   `VITE_ENABLE_SIGNUP=true` setzen oder Konten im Staging-Dashboard anlegen.
4. `npm run dev:staging` → Tests unten.

| Test | Schritte | Erwartung |
|---|---|---|
| Nachhilfe | A erstellt Angebot · B findet es, sendet Anfrage · A nimmt an · beide laden neu | A: „Angenommen“; B: „Angenommen“ + Vorname von A; vor Annahme sieht B keinen Namen |
| Nachhilfe negativ | B öffnet `/tutoring/<id>/edit` von A | Speichern scheitert („nicht gefunden“) |
| Profil | A: Profil öffentlich + nur Schule · B öffnet A | B sieht Vorname + Schule, **keine** Interessen/Projekte/Zahlen, **keine** Klasse/E-Mail |
| Profil zurückziehen | A: öffentlich aus · B lädt neu | „Profil nicht verfügbar“, A fehlt im Verzeichnis |
| Statistik | A: „Mein Bereich“ | Zahlen passend zu A's Anmeldungen/Ideen/Nachhilfe |

Status: **vorbereitet, nicht durchgeführt** (Staging-Projekt + Datei noch nicht vorhanden).

### Syntaxfehler in 011 gefunden und behoben (vor jeder Ausführung)
Beim Durchsehen des Diffs: In `011_tutoring.sql` standen an 3 Stellen einzelne `$` statt `$$` (Teil 0 und
`tutoring_list_requests`) – Ursache war eine automatische Textersetzung, in der `$$` als `$` eingesetzt wurde.
Zwei davon steckten schon im Commit `a7b50a3`. Folge wäre ein Syntaxfehler gewesen; da die Datei EINE Transaktion
ist, hätte sie nichts verändert, aber auch nicht funktioniert. Behoben.

Prüfung jetzt mit dem **echten PostgreSQL-Parser** (`libpg-query` 18.2, WASM; nur im Scratchpad installiert, kein
Projekt-Paket): alle 12 Migrationen parsen; alle 15 PL/pgSQL-Funktionskörper und DO-Blöcke in 004/011/012 parsen;
Kontrolltest mit absichtlich kaputtem Körper wird erkannt; die alte 011 aus `a7b50a3` scheitert wie erwartet.
Grenze: Der Parser prüft **Syntax**, nicht ob Tabellen/Spalten existieren oder Typen passen – das zeigt erst Staging.
Dauerhafter Test in `tests/migrations.test.js`: keine einzelnen `$`-Begrenzer, `$$` immer paarweise.

---

## Sitzung 2026-11-09 (4) – Commit Stufe 5, Stufe 6 (Projekt-Mitwirkung)

Commit `c15bfdf` (lokal, nicht gepusht): Stufe 5 + Migration 012 + Korrekturen 004/011 + Staging-Zugang.

### Stufe 6 – Projekt-Mitwirkung (wie Codex, auf Claude-Backend)

Eine veröffentlichte Idee (collecting/review/planned) ist ein Projekt. Ablauf: **anfragen → Autor:in nimmt an /
lehnt ab → Mitglied → austreten**; nach Ablehnung/Austritt erneut anfragen möglich. „Interesse“ bleibt die
bestehende Unterstützung (kein doppeltes System).

| Datei | Änderung |
|---|---|
| `supabase/migrations/013_project_members.sql` (neu) | `idea_members` ohne direkten Zugriff (RLS an, keine Policies, keine Rechte); 8 SECURITY-DEFINER-Funktionen; braucht 001 + 012 |
| `src/lib/projects.js`, `src/lib/projectsApi.js` (neu) | Regeln (welcher Knopf), Umwandlung, Fehlercodes DC021–DC024, Supabase-Aufrufe |
| `src/state/useRemote.js` (neu) | gemeinsames Laden für Profile + Projekte; beim Neuladen bleiben alte Daten sichtbar (kein Flackern) |
| `src/state/useProjects.js` (neu), `src/state/useProfiles.js` | Hooks; useProfiles nutzt jetzt useRemote |
| `src/components/projects/ProjectParticipation.jsx` (neu), `src/pages/IdeaDetailPage.jsx` | Bereich „Mitmachen“ auf der Ideen-Seite: Status, Knopf, Anfragen annehmen/ablehnen, Team |
| `src/pages/MePage.jsx` | Konto: echte Mitwirkungen unter „Meine Projekte“ + Zähler; Demo unverändert |
| `src/pages/PublicProfilePage.jsx` | „Projekt-Mitgliedschaften“ (nur mit Freigabe `show_projects`) |
| `src/locales/*`, `src/styles/modules.css` | Texte DE/TR/EN, Stile |
| `tests/projects.test.js` (neu), `tests/migrations.test.js` | 7 neue Tests; 013 hängt nicht von 008–010 ab |

Datenschutz: Außenstehende sehen nur die **Anzahl** der Mitglieder. Namen (Vorname + Schule) sehen nur Autor:in
(Anfragende + Mitglieder) und Mitglieder (Team). Im Profil nur mit Freigabe. Keine Nachrichten.

| Funktion | Echt / Demo / offen |
|---|---|
| Anfragen, zurückziehen, annehmen/ablehnen, austreten | echt nach 013 |
| Team + Anzahl, eigene Mitwirkungen, Mitgliedschaften im Profil | echt nach 013 |
| Demo (abgemeldet) | nur Hinweis „mit Konto mitmachen“ – keine vorgetäuschten Anfragen |
| Projekt-**Abschluss** | offen → Stufe 7 (braucht Admin-Status) |
| Statische Projekte p1–p3 im Netzwerk | weiterhin Demo |
| Events-Optik | Codex-Farben/Formen über die Tokens aus Stufe 2; kein eigener Umbau |
| Gruppenbeiträge | **aus** für den Pilot (Entscheidung Ege) |

Prüfungen: `npm test` **322/322**, `npm run build` ok, Render-Test 9 Routen ok (u. a. `/ideas/i1`, `/ideas/i3`, `/me`),
013 mit echtem PostgreSQL-Parser geprüft (25 Anweisungen, 8 Funktionen + 3 DO-Blöcke ok).
**Nicht geprüft:** gegen eine Datenbank, Konto-Modus, Browser.

**Staging-Reihenfolge jetzt:** 001–007 → 011 → 012 → 013. Zusatztest Projekt: A (Autor:in, Idee freigegeben
durch Admin) · B fragt an · A sieht B unter „Offene Anfragen“, nimmt an · B sieht „Du bist Mitglied“ + Team ·
C (dritte Person) sieht nur „1 Mitglied“, keine Namen · B tritt aus.
Hinweis: Damit eine Idee veröffentlicht ist, muss auf Staging ein Admin existieren (005: Eintrag in `admins`)
und die Idee freigeben.

---

## Sitzung 2026-11-09 (5) – Commit Stufe 6, Staging-Ablauf, Vorbereitung Stufe 7

Commit `fc0b9d7` (lokal, nicht gepusht): Stufe 6 + Migration 013 + Staging-Ablauf.
Neu: [STAGING_RUNBOOK.md](STAGING_RUNBOOK.md) (genaue Reihenfolge 001–007, 011, 012, 013; Testkonten; Tests T1–T6,
P1–P4, J1–J5) und `supabase/tests/staging_verify.sql` (nur lesen; mit dem PostgreSQL-Parser geprüft, keine
schreibenden Befehle). `.env.staging.local` existiert noch nicht → Staging-Prüfung offen.

### Plan Stufe 7 – Admin für die neuen Module (noch NICHT umgesetzt)

Grundsatz wie bisher: Admin-Rechte prüft **nur die Datenbank** (`public.is_admin()` aus 005, in jeder
`admin_*`-Funktion zuerst). Das Ausblenden von Knöpfen im Frontend ist nur Komfort, kein Schutz.

Geplante Migration **`015_admin_modules.sql`** (014 bleibt für Gruppen reserviert, die für den Pilot aus sind).
Abhängigkeiten: 005 (`is_admin`), 006, 011, 012, 013 – **nicht** 008–010.

| Teil | Inhalt | Annahme (empfohlene Variante) |
|---|---|---|
| A Nachhilfe-Moderation | `admin_list_tutoring_entries()` (alle, auch geschlossene, mit Schule + Anzahl Anfragen), `admin_set_tutoring_status(id, 'closed'/'active')`, `admin_delete_tutoring_entry(id)` | Admins sehen **Einträge**, aber **nicht** den Text privater Anfragen – nur deren Anzahl/Status. |
| B Profil-Moderation | `admin_list_public_profiles()`, `admin_hide_profile(user_id)` setzt `is_public = false` | Nur Ausblenden, kein Bearbeiten von Namen; die Person kann neu freigeben. |
| C Projekt-Abschluss | Spalte `ideas.completed_at` (Status bleibt `planned`); `admin_complete_project(idea_id)` nur für `planned`; Mitglieder bekommen „Abschluss bestätigt“ in Profil/Statistik | Neue Spalte statt neuem Status → keine Änderung an der Status-Prüfregel aus 006. |
| D 24-h-Ausblendung abgelehnter Ideen | Spalte `ideas.rejected_at` (Trigger setzt sie, wenn der Status auf `rejected` wechselt – `admin_set_idea_status` aus 006 bleibt unverändert); Lese-Policy: eigene abgelehnte Ideen nur noch bis 24 h nach `rejected_at` | **Ohne pg_cron** (009 ist live nicht ausgeführt): reine Lese-Bedingung mit `now()`, nichts wird gelöscht. Bereits abgelehnte Ideen bekommen beim Ausführen `rejected_at = now()` (24 h Schonfrist). Admins sehen weiterhin alles. |
| E Admin-Seiten | `/admin/tutoring`, `/admin/profiles`, Abschluss-Knopf in `/admin/ideas` | Gleiches Muster wie bestehende Admin-Seiten (lazy geladen hinter `AdminRoute`). |

Risiko D: Die Lese-Policy auf `ideas` ändert sich. 006 prüft beim Ausführen zeichengenau gegen v3 – deshalb muss
015 **nach** 006 laufen und 006 danach nie erneut. 015 bekommt eine eigene Selbstprüfung für die neue Policy.

**Entschieden (Ege, 2026-11-09)** – siehe auch FINAL_INTEGRATION_PLAN.md Abschnitt 8:
1. Admins moderieren Nachhilfe-**Einträge**, lesen aber **keine** privaten Anfrage-Texte (nur Anzahl/Status).
2. Projekt-Abschluss **nur durch Admins**.

Stufe 7 bleibt bis zur Freigabe **nicht umgesetzt**.

---

## Sitzung 2026-11-09 (6) – Staging-Verbindung geprüft (kein SQL, keine Datenbank-Änderung)

`.env.staging.local` von Ege angelegt (in `.gitignore`, nicht gestaget). Alle Prüfungen nur lesend; ausgegeben
wurden nur Hosts, HTTP-Codes und Ja/Nein.

| Prüfung | Ergebnis |
|---|---|
| `npm run check:staging` | OK · Host `ycyqdqmiawhzzrduxupe.supabase.co` · unterscheidet sich von `.env.local` (Live) |
| `GET /auth/v1/health` (Staging) | HTTP 200 |
| `GET /auth/v1/settings` (Staging) | HTTP 200 · E-Mail-Anmeldung an · Registrierung erlaubt · **E-Mail-Bestätigung an** (→ Runbook Variante B oder auf A umstellen) |
| `GET /rest/v1/schools` (Staging) | HTTP 404 / `PGRST205` = Data API antwortet, Tabelle fehlt (**erwartet**: Migrationen noch nicht ausgeführt) |
| Staging-Build (`npm run build -- --mode staging`, Ausgabe im Scratchpad, danach gelöscht) | Staging-Host enthalten: Ja · Live-Host: Nein · Live-Key: Nein · `sb_secret_`: Nein · service_role-JWT: Nein (0 JWTs im Bundle) · STAGING-Kennzeichnung: Ja |
| Wort „service_role“ im Bundle | nur die Schutzprüfung aus `supabaseClient.js` (lehnt geheime Keys ab), kein Key |
| `npm run dev:staging` (kurz auf Port 5199, danach beendet) | startet · Modus `staging` · `[Staging] Supabase-Projekt: ycyqdqmiawhzzrduxupe…` · nutzt Staging-Host, nicht Live-Host · `VITE_DC_TARGET = "staging"` gesetzt |

**Vorfall:** Beim Prüfen des Wortes „service_role“ wurde ein Code-Ausschnitt ausgegeben, der die letzten 13 Zeichen
des **Staging-publishable-Keys** enthielt (Maskierung griff nicht, weil der Ausschnitt mitten im Key begann).
Publishable Keys sind für den Browser bestimmt und stehen ohnehin im Bundle; Live-Daten waren nicht betroffen.
Seitdem werden in der Nähe von Keys nur noch Ja/Nein ausgegeben. Optional: Staging-Key im Dashboard neu erzeugen.

Weiterhin **nicht** getestet: Migrationen 001–013 auf Staging, alle Funktionen gegen eine echte Datenbank, Browser.
*(Überholt durch Sitzung 7: Migrationen sind inzwischen auf Staging ausgeführt.)*

---

## Sitzung 2026-11-09 (7) – Staging-Stand korrigiert, Bestandsaufnahme Spiele/Chat/Gruppen

**Korrektur (Ege):** Staging hat **001–007, 010, 011, 012, 013** erfolgreich ausgeführt. 008 und 009 sind bewusst
ausgelassen. 010 ist von Ege geprüft: `admin_get_overview_stats()` existiert und die Admin-Statistik funktioniert.
Ich habe **kein** SQL ausgeführt. Geändert habe ich nur die Doku und `staging_verify.sql`: Die Prüfabfrage prüft jetzt
zusätzlich `admin_get_overview_stats()` (SECURITY DEFINER, fester search_path, kein anon).
Der Live-Stand bleibt unverändert: 001–007.

### Bestandsaufnahme Kerems Codex-Version (`codex-version-1.0`, `124fc15`) – nur gelesen

Grundproblem aller vier Module: Codex speichert alles in **einem JSONB-Workspace** und prüft Befehle in einer
Edge Function (`supabase/functions/_shared/platform.js`, `social.js`, Migration `202611070001_platform.sql`).
Die Integration nutzt dagegen **eigene Tabellen + RLS + RPCs** (001–013). Deshalb lässt sich nichts 1:1 übernehmen.
Übernehmen lassen sich die **Regeln und die Oberfläche**, die Speicherung muss als neue Migration nachgebaut werden.

| Modul | Was Codex hat | Was davon echt war | Was für die Integration fehlt | Migration |
|---|---|---|---|---|
| **Spiele: Symbolpaare, Papierflug, Brückenläufer** | `src/games/MemoryGame.jsx`, `ArcadeGame.jsx`, `arcade.js`, `games.css` | Spiele laufen komplett im Browser | UI portieren (geht ohne DB) | **keine** für reines Spielen |
| **Bestenlisten** | `leaderboards.js`, `resultRepository.js`, `GameLeaderboard.jsx`; Opt-in je Spiel; Ränge 1-1-3 | **nur lokaler Browserspeicher**, keine echte globale Liste; Codex sagt selbst, Punkte sind ohne Serverprüfung fälschbar | Tabelle `game_results` + `game_leaderboard_optin`, RPC zum Eintragen mit Plausibilitätsgrenzen, RPC für Global/Schule ohne Namen anderer ohne Opt-in | **017** (geplant) |
| **Schach + Einladungen** | `ChessBoard.jsx`, `ChessLobby.jsx`, `_shared/chess.js` (Zugprüfung serverseitig), Glocke + `/me/notifications` | Edge Function prüfte Züge; Polling alle ~4 s; kein E-Mail-Versand | Tabellen `chess_challenges`, `chess_games` + RPCs, Zugprüfung in SQL **oder** eigene Edge Function (Architektur-Entscheidung nötig); Benachrichtigungen | **016** (geplant) |
| **Chatroom (Themenräume general/learning/projects/events)** | `Community.jsx` Abschnitt „rooms“, `postMessage` (3–1200 Zeichen, keine Kontaktdaten, max. 10/min), `report`, `moderateMessage`, `resolveReport`, Blockieren | Schreiben im Konto-Modus nur, wenn `communityEnabled` (Moderation) an war, sonst `moderation-required` | Tabellen `groups`, `group_members`, `group_messages`, `reports`, `blocks`; Moderation durch Admins; Melden; Löschfristen | **014** (reserviert) |
| **Projektgruppen** | `createProjectGroup`: nur Ideen-Autor:in; Mitglieder = Autor:in + Projektmitglieder; geschlossen bei gelöschter/zurückgezogener Idee | Mitgliederliste war aus der Idee abgeleitet | Mitglieder können direkt aus `idea_members` (013) abgeleitet werden → keine eigene Mitgliederliste nötig; Nachrichten wie Chatroom | **014** |
| **Eventgruppen** | `createEventGroup`: nur bei bestätigtem Event, durch Ersteller:in oder Moderator; Mitglieder = Ersteller:in + Angemeldete; geschlossen bei Absage | wie oben | Mitglieder aus `event_registrations` (001, `status = 'registered'`); Nachrichten wie Chatroom | **014** |

### Was noch offen ist (Reihenfolge-Vorschlag)

1. **Erst Staging-Funktionstests** T1–T6, P1–P4, J1–J5 für 011–013 (braucht Testkonten + Admin, Runbook Abschnitt 4).
2. **Stufe 7** (Migration 015, Admin für die neuen Module) – Plan steht, Freigabe ausstehend.
3. **Spiele ohne Bestenliste** (Stufe 8a): reine Frontend-Portierung, keine Migration, kein Datenschutzrisiko.
4. **Bestenlisten** (Stufe 8b, Migration 017) und **Schach** (Migration 016): vorher entscheiden, ob Schachzüge in SQL
   oder in einer Edge Function geprüft werden.
5. **Gruppen + Chat** (Migration 014): Für den Pilot bleibt das **aus** (Entscheidung Ege), bis der Moderationsablauf feststeht.
   Offene Fragen: Wer moderiert? Wie schnell wird auf Meldungen reagiert? Wie lange werden Nachrichten aufbewahrt?
   Gibt es Gruppen-Chats nur für Projekte/Events oder auch offene Themenräume? Wichtig: Es sind **Gruppen**chats,
   keine privaten 1:1-Nachrichten (AGENTS Regel 11).

Noch **nichts davon umgesetzt**, keine neue Migration angelegt.

---

## Sitzung 2026-11-09 (8) – Stufe 8a, Schritt 1: Symbolpaare (nicht committet)

Spiel von **Kerem** (Codex `codex-version-1.0`: `src/games/MemoryGame.jsx`, `shuffledPairs` aus `arcade.js`),
für die Integration angepasst. Läuft **nur im Browser**: keine Anmeldung, keine Datenbank, keine Migration,
**keine Speicherung** (auch kein localStorage), **keine Bestenliste**.

- Routen: `/community/games` (Übersicht) und `/community/games/symbol-pairs`; Karte „Spiele“ auf `/community`.
- Logik als reine Funktionen in `src/games/symbolPairs.js` (getestet in `tests/symbolPairs.test.js`),
  Oberfläche in `src/games/SymbolPairs.jsx`, Optik in `src/styles/games.css` (nur unsere Farbvariablen).
- Abweichungen von Kerems Version: Symbol-Namen für Screenreader in de/tr/en; Karten werden beim Umdrehen nicht
  `disabled` (sonst verliert man mit der Tastatur den Fokus), sondern nur blockiert (`aria-disabled`).
- Nicht lazy geladen: Außerhalb von `/admin` gibt es keine `Suspense`-Grenze, das Spiel ist nur wenige KB groß.
  Für Schach (größer) später prüfen.
- Geprüft: `npm test`, `npm run build`, `git diff --check`. **Nicht** im Browser geprüft.

## Sitzung 2026-11-09 (9) – Stufe 8a, Schritt 2: Papierflug (nicht committet)

Spiel von **Kerem** (Codex: `freshFlight`/`flightDifficulty`/`stepFlight` aus `src/games/arcade.js`, Oberfläche und
SVG aus `src/games/ArcadeGame.jsx`). Nur im Browser, **kein Bestwert** (Kerems lokaler Bestwert wurde bewusst
weggelassen), keine Bestenliste, keine Datenbank.

- Route `/community/games/paper-flight`; Karte in der Spiele-Übersicht.
- `src/games/paperFlight.js`: Kerems Rechenregeln unverändert, nur lesbarer formatiert (getestet in
  `tests/paperFlight.test.js`, inkl. Kerems zwei ursprünglicher Prüfungen).
- `src/games/useArcadeLoop.js`: Game Loop als eigener Hook (Phasen ready/playing/paused/over, Pause bei
  Tab-/Fensterwechsel) – für Brückenläufer wiederverwendbar.
- SVG-Farben über CSS-Klassen mit unseren Farbvariablen statt fester Farbwerte.
- Nach „Starten“ liegt der Fokus auf dem Spielfeld, damit die Leertaste Auftrieb gibt statt erneut den Knopf zu drücken.
- Hinweis zur Barrierefreiheit im Spiel: schnelles Reaktionsspiel, Alternative ohne Zeitdruck = Symbolpaare.
- Geprüft: `npm test` (334/334), `npm run build`, `git diff --check`. **Nicht** im Browser geprüft.

## Sitzung 2026-11-09 (10) – Stufe 8a, Schritt 3: Brückenläufer (nicht committet)

Spiel von **Kerem** (Codex: `freshRunner`/`stepRunner` aus `src/games/arcade.js`, SVG aus `src/games/ArcadeGame.jsx`).
Nur im Browser, nur Punkte der aktuellen Runde, kein Bestwert, keine Bestenliste, keine Datenbank.

- Route `/community/games/bridge-runner`; Karte in der Spiele-Übersicht. Unter „In Integration“ steht nur noch Schach.
- `src/games/bridgeRunner.js`: Kerems Rechenregeln unverändert, nur lesbarer formatiert
  (getestet in `tests/bridgeRunner.test.js`, inkl. Kerems drei ursprünglicher Prüfungen).
- Neue gemeinsame Hülle `src/games/ArcadeGame.jsx` (wie bei Kerem eine Komponente für beide Spiele):
  Punkte, Spielfeld, Knöpfe, Status, Hinweis-Fenster. `PaperFlight.jsx` und `BridgeRunner.jsx` liefern nur noch
  Regeln + Zeichnung. Game Loop weiterhin in `useArcadeLoop.js`.
- Texte: gemeinsame Spieltexte nach `games.arcade.*` verschoben (vorher `games.paperFlight.*`);
  CSS-Hintergrund-Klassen `flight-sky/hill/cloud` → `arcade-sky/hill/cloud`.
- Geprüft: `npm test` (343/343), `npm run build`, `git diff --check`. **Nicht** im Browser geprüft.

## Sitzung 2026-11-09 (11) – Leistung Papierflug + Brückenläufer (nicht committet)

**Ursachen (im Code gefunden):** `useArcadeLoop` hat in jedem Bild `setScene` aufgerufen → React rendert die ganze
Spielkarte ~60× pro Sekunde neu; danach ändert React SVG-Attribute → der Browser muss jedes Bild Styles neu berechnen
und die SVG neu aufbauen. Zusätzlich lief das Spiel unter ~28 Bildern/s in Zeitlupe (Zeitschritt auf 0,035 s gekappt).
Keine doppelten Game Loops, Event-Listener wurden korrekt entfernt.

**Änderungen:** Zeichnen auf `<canvas>` (`src/games/arcadeCanvas.js`, Kerems Formen 1:1 übertragen); Spielzustand im
`useRef`, React rendert nur bei Phasenwechseln; Punkte direkt ins DOM, nur bei Änderung; Pixeldichte auf 2× begrenzt;
Farben einmal aus den CSS-Variablen gelesen; Zeit in Teilschritten von 1/60 s (`src/games/arcadeStep.js`, getestet in
`tests/arcadeStep.test.js`). Spielregeln (`paperFlight.js`, `bridgeRunner.js`) unverändert.

**Messung** (Headless-Chrome per DevTools-Protokoll, 390×844, DPR 3, CPU 4× gedrosselt, 12 s automatisches Spielen,
je 2–4 Läufe; Hauptthread-Arbeit pro Bild):

| | vorher | nachher |
|---|---|---|
| Papierflug, Build | 4,9–6,3 ms (davon Styles 1,3–1,7 ms) | 1,1–1,4 ms (Styles ~0) |
| Brückenläufer, Build | 3,0–3,5 ms (Styles ~0,5 ms) | 1,4 ms (Styles ~0) |
| Papierflug, `npm run dev` | 7,2 ms (JavaScript 3,6 ms) | 1,3 ms |
| Brückenläufer, `npm run dev` | 5,9 ms (JavaScript 3,2 ms) | 1,3 ms |
| DOM-Änderungen pro Bild | 2–3 | 0–0,1 |

Grenzen der Messung: kein echtes Handy, kein GPU-/Raster-Anteil, Headless-Chrome ohne 60-Hz-Begrenzung.
Screenshots vorher/nachher verglichen: gleiche Optik. **Auf echten Handys noch nicht geprüft.**

## Sitzung 2026-11-09 (12) – Stufe 8a, Schritt 4: Schach zu zweit am selben Gerät (nicht committet)

Spiel von **Kerem**: `src/games/chess.js` ist **unverändert** aus `supabase/functions/_shared/chess.js`
(Codex `codex-version-1.0`) übernommen; Brett, Auswahl, Zielfelder, Umwandlung, Brett drehen, Aufgeben/Remis und
Zugliste nach seinem `src/games/ChessBoard.jsx`. Nur lokaler State, kein Online-Spiel, keine Speicherung,
keine Bestenliste, keine Datenbank.

- Route `/community/games/chess`; Karte in der Spiele-Übersicht. Der Abschnitt „Weitere Spiele / In Integration“
  entfällt (alle vier Spiele eingebaut); auf `/community` steht unter „geplant“ nur noch „Gruppen“.
- `src/games/chessHotseat.js`: Reducer (Zug, Zurücknehmen, Neustart, Aufgeben, Remis vereinbaren/beanspruchen).
  Jede Stellung wird einmal berechnet und gemerkt (kein Nachspielen der ganzen Partie bei jedem Zug).
- `src/games/ChessGame.jsx`: Brett mit 64 Knöpfen (Tastatur + Screenreader: „e4: Dame (Weiß)“, „möglicher Zug“),
  letzter Zug und König im Schach markiert, Umwandlung per Auswahlfenster, Bestätigung vor Aufgeben/Remis/Neustart.
- Figuren als Unicode mit `\uFE0E` (Text statt Emoji, v. a. iOS).
- Tests `tests/chess.test.js`: Kerems 8 Regeltests (Perft-Referenzstellungen) + 6 Hotseat-Tests.
- Geprüft: `npm test`, `npm run build`, `git diff --check`; zusätzlich in Headless-Chrome (390 px) per Klick
  durchgespielt (Zugwahl, Schäfermatt, Zurücknehmen, Neustart mit Bestätigung, Umwandlung in Springer,
  kein seitliches Scrollen). **Nicht** auf echten Handys geprüft.

## Sitzung 2026-11-09 (13) – Eigener Hauptbereich „Spiele“ (nicht committet)

- Hauptnavigation jetzt **sechs** Bereiche: Start · Entdecken · Nachhilfe · Community · **Spiele** · Mein Bereich
  (neues Icon `gamepad`). Annahme: „Projects“ aus der Anfrage = bestehender Bereich „Entdecken“ (Events, Ideen,
  Projekte, Netzwerk) – nicht umbenannt.
- Neue Routen: `/games`, `/games/symbol-pairs`, `/games/paper-flight`, `/games/bridge-runner`, `/games/chess`.
  Alte Adressen `/community/games` und `/community/games/:game` leiten mit `<Navigate replace>` um
  (unbekanntes Spiel → „Seite nicht gefunden“).
- Community: Karte „Spiele“ entfernt; sonst unverändert (Nachhilfe, Schülerprofile, Netzwerk, geplant: Gruppen).
- Spiel-Code (`src/games/`) unverändert, inkl. Canvas-Optimierung.
- Navigation mit sechs Einträgen: Schrift `clamp(0.62rem, 2.75vw, 0.72rem)`, kompaktere Abstände; Desktop-Leiste
  einzeilig ab 1050 px. Gemessen in Headless-Chrome (de/tr/en): ab 360 px passt jedes Wort in eine Zeile, keine
  Überlappung; bei 320 px wird „Community“ zweizeilig umbrochen.
- Geprüft: `npm test` (363/363), `npm run build`, `git diff --check`; Headless-Chrome: Navigation 320/360/375/390/412/
  1050/1280 px, drei Sprachen, Weiterleitungen, alle vier Spiele kurz angespielt. **Nicht** auf echten Geräten geprüft.

## Sitzung 2026-11-09 (14) – Stufe 8b: Bestenlisten Papierflug + Brückenläufer (nicht committet)

**Migration `017_game_leaderboards.sql`** (Nummer laut Plan reserviert; braucht 001 + 012; **nicht** auf Staging oder
Live ausgeführt – führt Ege auf Staging aus, siehe STAGING_RUNBOOK Schritt 3 Nr. 11).
- Tabellen `game_scores` (Bestwert je Person/Spiel), `game_runs` (vom Server gesetzte Rundenstart-Zeit),
  `game_leaderboard_optin` (Anzeige an/aus, Standard **aus**). Alle: RLS an, keine Policies, keine Rechte.
- Funktionen (SECURITY DEFINER, `search_path = ''`, nur `authenticated`, immer `auth.uid()`):
  `game_start_run`, `game_submit_score`, `game_set_leaderboard_visibility`, `game_my_status`, `game_leaderboard`
  (Top 10, Platz nach Wettkampf-Regel 1-1-3, nur Vorname/Punkte/is_self).
- Schutz: Plausibilitätsgrenze aus den Spielregeln gegen die serverseitig gemessene Zeit; ein Rundenstart = eine
  Einreichung; max. 3 h; niedrigerer/gleicher Wert ersetzt nie den Bestwert. Grenze: Bots, die echt spielen.
- **Annahme (Datenschutz):** Profile sind seit 012 privat → Vorname erscheint nur nach Zustimmung (gilt für beide Spiele).

**Frontend:** `src/lib/leaderboard.js`, `leaderboardApi.js`, `src/state/useGameLeaderboard.js`,
`src/games/GameLeaderboard.jsx`; Spiele melden nur „Runde beginnt/endet“ (Mechanik unverändert).

**Geprüft:**
- `npm test` (inkl. `tests/leaderboard.test.js`: Autopilot-Simulation zeigt, dass ehrliches Spielen unter der Grenze bleibt).
- **Lokale Wegwerf-PostgreSQL 18** (Scratchpad, Port 54329; mit Supabase-Nachbildung für `auth.uid()`/Rollen):
  001–004, 011, 012, 013, 017 ausgeführt, 017 zweimal (wiederholbar), `017_leaderboard_test.sql` L1–L22 alle OK,
  zusätzlich leere Liste + Top-10-Grenze. (005 bricht dort an der eigenen Selbstprüfung ab – PostgreSQL 18 speichert
  NOT NULL als Constraint `n`; Supabase-Version nicht betroffen, 017 braucht 005 nicht.)
- Headless-Chrome mit **abgefangenen** Supabase-Anfragen (nachgebildetes Backend, nichts erreichte Staging/Live):
  abgemeldet (0 Aufrufe), leere Liste, Gleichstand, Top 10, eigene Zeile, Zustimmung, kein erneutes Senden bei
  gleichem Wert, de/tr/en, 320/390/1280 px.
- **Offen:** echter Staging-Test (Migration + B1–B8 im Runbook).

## Sitzung 2026-11-09 (15) – Korrektur 017: abgelehnte Einreichung verbraucht die Runde (nicht committet)

**Fehler (gemeldet von Ege):** `game_submit_score()` löschte den Rundenstart und löste danach bei unplausibler
Punktzahl/abgelaufener Runde eine Exception aus. Eine Exception rollt die ganze Funktion zurück – auch das DELETE.
Die Runde blieb bestehen und hätte nach Warten erneut (dann plausibel) eingereicht werden können.
Lokal nachgestellt: altes Muster → Runde nach Ablehnung noch vorhanden (bestätigt).

**Korrektur:** Nach dem DELETE keine Exception mehr. Ablehnungen kommen als Ergebnis zurück:
`returns table (best_score, is_new_best, status)` mit `status` = `saved` · `kept` · `implausible` · `expired`.
Nur `DC031` (keine/verbrauchte Runde) bleibt eine Exception – dann wurde nichts gelöscht. `DC032`/`DC033` entfallen.
Neue Selbstprüfung in 017: nach der Markierung „AB HIER KEINE EXCEPTION MEHR“ darf kein `raise` stehen
(Gegenprobe: absichtlich eingebautes `raise` → ABBRUCH, Rollback). Frontend: `mapSubmitResult` liest `status`,
`rejectedSubmitKey()` → Meldung; Datenschutz/RLS unverändert.

**Geprüft:** `017_leaderboard_test.sql` lokal (Wegwerf-PostgreSQL) – 25 Prüfungen OK, neu L7b (Runde nach Ablehnung
gelöscht), L7c (nach „Warten“ nicht erneut einreichbar → DC031), L13b (abgelaufene Runde verbraucht);
017 zweimal ausführbar; `npm test`, `npm run build`, `git diff --check`. Weiterhin **nicht** auf Staging ausgeführt.

## Sitzung 2026-11-09 (16) – Bestenlisten auf die Spiele-Übersicht verschoben (nur Frontend, nicht committet)

- `/games`: unter den Spiel-Kacheln Abschnitt „Bestenlisten“ mit zwei Karten „Papierflug – Top 10“ und
  „Brückenläufer – Top 10“ (ab 760 px nebeneinander, darunter untereinander), je mit eigenem Bestwert/Platz;
  ein gemeinsamer Haken „In Bestenlisten anzeigen“ (Zustimmung gilt weiterhin für beide Spiele).
  Abgemeldet: ein Anmelde-Hinweis statt Listen.
- Spielseiten: keine Liste mehr; sie reichen weiterhin ein (`useGameLeaderboard(…, { loadBoard: false })` lädt nur den
  eigenen Stand) und zeigen eine kurze Rückmeldung + Link „Zu den Bestenlisten“ (`/games#leaderboards`).
- `src/games/GameLeaderboard.jsx` ersetzt durch `src/games/GameLeaderboards.jsx`.
- **Unverändert:** Migration 017, RPCs, RLS, Plausibilitätsprüfung, Datenschutz, Opt-in.
- Geprüft: `npm test`, `npm run build`, `git diff --check`; Headless-Chrome mit abgefangenen Supabase-Anfragen
  (abgemeldet 0 Aufrufe, Listen/Gleichstand/Top 10, Einreichen auf der Spielseite ohne Laden der Liste, Zustimmung lädt
  beide Listen neu, de/tr/en, 320/390/1280 px ohne Überlauf). Nicht auf echten Geräten / Staging.

## Sitzung 2026-11-09 (17) – Chatroom (Migration 014 + Frontend; nicht committet, nicht ausgeführt)

Ausführlich: [CHATROOM.md](CHATROOM.md). Kurz:
- **Migration `014_chat.sql`** (für Gruppen/Chat reserviert): 13 Tabellen, RLS überall, Schreiben nur über
  SECURITY-DEFINER-Funktionen mit `auth.uid()`, 5 Lese-Policies nur für Realtime. Themenräume (4, Konzept aus Kerems
  Codex-Version), Projekt-/Eventgruppen (Mitglieder aus 013 bzw. Anmeldungen), private Chats nur über
  Nachrichtenanfragen, Reaktionen, Suche, serverseitiger Wortfilter (DE/TR/EN) + Kontaktdaten-Sperre, Melden,
  Blockieren, Sperren (global/Raum), Moderator:innen, Audit-Protokoll. **Chat nach dem Ausführen AUS.**
- **Frontend:** `/chat`, `/chat/rooms/:id`, `/chat/conversations/:id`, `/chat/moderation`; „Nachricht senden“ auf
  öffentlichen Profilen; „Projektgruppe“ im Projekt-Team; Karte auf `/community`; Realtime + Fallback-Abfrage.
- **Rückbau:** `supabase/rollback/014_chat_rollback.sql` (lokal getestet, danach 014 erneut einspielbar).
- **Geprüft:** `npm test`, `npm run build`, `git diff --check`; lokal (Wegwerf-PostgreSQL 18, Supabase-Nachbildung):
  014 zweimal ausführbar, `014_chat_test.sql` 141 × OK / 0 × FEHL; Oberfläche in Headless-Chrome gegen diese
  lokale Datenbank (alle Supabase-Anfragen abgefangen, nichts an Staging/Live) – Raum, Wortfilter, Kontaktdaten,
  Reaktion, Anfrage → Annahme → Gespräch, Melden, Moderation (Löschen, Sperre), gesperrte Person liest weiter.
  Dabei gefunden und behoben: mehrdeutige Variable `reason` (SQL), Reihenfolge der Themenräume, Aktionen ohne
  Rückgabewert (Beitreten, Reaktion entfernen) lösten kein Neuladen aus, falscher Sperrtext bei globaler Sperre.
- **Nicht** geprüft: echtes Supabase Realtime (lokal nicht verfügbar), echte Geräte, Staging.
- Offene Entscheidungen: siehe CHATROOM.md Abschnitt 11.

## Sitzung 2026-11-09 (18) – Audit: Ablauf/Löschen von Events (nicht committet)

Bericht mit Belegen: [EVENT_EXPIRATION.md](EVENT_EXPIRATION.md).
- Regel (008/009 + `src/lib/eventArchive.js`): **archivieren statt löschen**, ab Ende + 24 h (ohne Dauer: Mitternacht
  Ankara-Zeit); erfüllt „nie vor Start + 24 h“, ignoriert `created_at`, rechnet beim Verschieben neu, idempotent.
  008/009 sind weder auf Live noch auf Staging ausgeführt (Frontend blendet trotzdem aus).
- Geändert (nur lokal): `014_chat.sql` – `chat_rooms.event_id` jetzt `ON DELETE RESTRICT` (+ Umstellung, Selbstprüfung),
  damit Event-Löschen keine Chat-Nachrichten mitnimmt.
- Neu: `supabase/tests/008_event_expiry_rules_test.sql` (R1–R18), 9 neue JS-Tests in `tests/eventArchive.test.js`.
- Offen: abgesagte Events verschwinden 24 h nach der Absage, auch vor dem Termin (frühere Entscheidung) – Änderung
  beschrieben, nicht umgesetzt; Projektgruppen bei gelöschter Idee (CASCADE).

## Sitzung 2026-11-10 (19) – Events automatisch LÖSCHEN (nicht committet, nur lokal)

Ausführlich: [EVENT_EXPIRATION.md](EVENT_EXPIRATION.md).
- **Neue Regeln:** abgesagt → gelöscht ab Absage + 24 h (Termin egal); planned/confirmed/completed → gelöscht ab
  Start + 24 h (Dauer egal); Entwürfe nie. Ersetzt in der Wirkung das Archivieren aus 008/009.
- **Neu:** `018_event_auto_delete.sql` (`event_deletion_due_at`, `delete_expired_events`, `event_deletion_log`,
  Selbstprüfung mit Probe ±1 s), `019_event_auto_delete_cron.sql` (pg_cron jede Minute, entfernt Job aus 009).
- **Geändert:** `014_chat.sql` – Eventgruppe bleibt beim Löschen erhalten (`chat_detach_event_room`, `event_title`,
  Mitglieder gesichert, archiviert, DC051 gegen Wieder-Öffnen); `src/lib/eventArchive.js` (`eventDeletionDueAt`,
  `isDeletionDue`, `visibleToStudents` blendet pünktlich aus); `src/lib/chat.js` + Locales (DC051).
- **Tests:** `supabase/tests/018_event_auto_delete_test.sql` 29 × OK, Echtzeit-Lauf, 019 gegen pg_cron-Nachbildung;
  014/008-Tests weiter grün; `tests/eventAutoDelete.test.js` neu. Vorher schon rot (nicht angefasst):
  `eventArchive.test.js` „008 K4“, 2 Navigationstests.
- **Offen:** Staging-Test mit echtem pg_cron; Entscheidung zur Teilnahme-Statistik (sinkt durch Löschen).

## Sitzung 2026-11-10 (20) – Chatroom: „Raum betreten“ + Chat-Ansicht (nicht committet, nur lokal)

Ausführlich: [CHATROOM.md](CHATROOM.md) Abschnitt 6 + 10. Keine neue Tabelle, kein zweites Nachrichtensystem.
- **Knöpfe:** kein Mitglied → „Beitreten“; Mitglied → „Raum betreten“ + „Verlassen“ (`RoomActionButtons.jsx`,
  `roomActions()`); Raumseite für Nicht-Mitglieder gesperrt (ohne Nachrichten); Verlassen → zurück zu `/chat`.
- **Ansicht:** Profilbild-Kürzel in der Profilfarbe, Name, Zeit, „Senden“, Live-Anzeige. 014: Nachrichten-Funktionen
  liefern zusätzlich `sender_avatar_color` (Funktionen werden vorher gelöscht → 014 bleibt wiederholbar).
- **Sicherheit:** unverändert in der Datenbank (Funktionen + RLS-Policy aus 014); nur die Profilfarbe kommt hinzu
  (wie im Profil-Verzeichnis aus 012 ohnehin sichtbar).
- **Tests:** `014_chat_room_access_test.sql` 23 × OK, `014_chat_test.sql` 141 × OK, `018`-Test 29 × OK (lokal);
  `tests/chatRoomAccess.test.js`; Headless-Chrome gegen lokale DB (alle Supabase-Anfragen abgefangen): ganzer Ablauf
  inkl. neuer Nachricht ohne Neuladen (Fallback-Neuladen, Realtime lokal nicht verfügbar).
- **Offen:** Staging (014 dort noch nicht ausgeführt); echtes Realtime; Kopfzeile im Staging-Build ist auf 390 px
  breiter als der Bildschirm (Badges STAGING/DEMO – nicht Teil dieser Änderung).

## Sitzung 2026-11-10 (21) – Beta-UX: Begrüßung, Toasts, Chat-Übersicht, Hilfe

- **Begrüßung:** „Guten Morgen/Tag/Abend, {Vorname}!“ nach lokaler Uhrzeit (05–11:59 / 12–17:59 / 18–04:59),
  wechselt ohne Neuladen (`useNow`, jede Minute). Ohne Vornamen: Fassung ohne Namen. `src/lib/greeting.js`.
- **Toasts:** `ToastProvider` (`src/components/toast/ToastContext.jsx`), eine `aria-live`-Region, 4 s, Schließen per
  Knopf/Escape, keine Doppelten (`src/lib/toastQueue.js`). Nur nach bestätigtem Erfolg: Raum beitreten/verlassen,
  Nachricht gesendet, Event-Anmeldung/-Abmeldung/Interesse, Profil-Freigabe gespeichert (ersetzt dort die feste
  Erfolgsmeldung). `setRegistration` liefert jetzt `true/false`.
- **Chat-Übersicht:** Zeit der letzten Nachricht (nur Mitglieder), Gruppen nach Aktivität sortiert, Live-Nachladen
  (`useChatRooms({ live: true })`). **Kein** Ungelesen-Punkt: es gibt keinen Lesestatus → Vorschlag in
  `docs/CHATROOM.md` Abschnitt 11, Punkt 9 (braucht DB-Änderung + Freigabe).
- **Hilfe & FAQ:** `/help` (Accordion mit `<details>`), Links in Fußzeile, Profil-Menü und „Mein Bereich“.
- **Keine Datenbank-Änderung.** Tests: `tests/uxImprovements.test.js`; Headless-Chrome gegen lokale DB.
- **Offen:** Kopfzeile im Staging-Build auf 390 px zu breit → dort ragt auch der Toast rechts über den Rand
  (ohne die Überbreite passt er, gemessen 16–374 px).

## Sitzung 2026-11-10 (23) – Frontend für Lesestand (020; nicht committet, nur lokal getestet)

- Neu: `loadMessages`, `markRead`, `fetchInboxState` (chatApi.js); `mapLoadResult`, `buildInbox`, `inboxPreview`,
  `canMarkRead`, `markReadOutcome` (chat.js); `useChatInbox`, Lesestand-Hook in `useChatRoom`/`useChatConversation`.
- Übersicht: Vorschau + Zeit + Ungelesen-Punkt für Themenräume, Projekt-/Eventgruppen und private Chats.
- Tests: `tests/chatReadState.test.js` (11); Headless-Chrome gegen lokale DB mit 020 (alle Supabase-Anfragen abgefangen).
- Offen: Test mit echten Konten auf Staging (020 dort laut Ege ausgeführt – nicht von mir geprüft); echtes Realtime.

## Sitzung 2026-11-10 (24) – Akzentfarben + Schwarz-Rot-Gold (nicht committet, nur lokal getestet)

- **Darstellung** (Einstellungen): 6 Akzentfarben (Ocean Blue = Standard), Vorschau, Zurücksetzen. Speichern nur im
  Browser (`localStorage`, Schlüssel `deutschconnect.accent`), keine Datenbank. `index.html` setzt die Farbe vor dem
  ersten Zeichnen (kein Aufblitzen); ungültige Werte → Ocean Blue.
- **Farbwerte**: `src/styles/themes.css`, erzeugt mit `scripts/generateThemes.mjs` (Kontrast nach WCAG geprüft:
  Buttons mit weißer Schrift ≥ 4.5:1, Links ≥ 6:1, Fokus ≥ 9:1). Status- und Markenfarben bleiben fest.
- **Marke**: Schwarz-Rot-Gold-Streifen unter „DeutschConnect“ in der Kopfleiste; Logo-Kachel und „Connect“ in festem
  Markenblau (unabhängig von der Akzentfarbe).
- Tests: `tests/appearance.test.js` (10); Headless-Chrome (Demo-Modus, alle Supabase-Anfragen abgefangen).
- Später geändert: Auswahl unter Einstellungen entfernt (Sitzung 27), Logo-Kachel jetzt Flaggen-Stil (Sitzung 28).

> **Nachtrag Sitzung 22 (Migration 020, Lesestand):** Hier nie eingetragen. Im Repository liegen
> `supabase/migrations/020_chat_read_state.sql`, `supabase/rollback/020_chat_read_state_rollback.sql` und
> `supabase/tests/020_chat_read_state_test.sql`; Beschreibung in [CHATROOM.md](CHATROOM.md) Abschnitte 11–12.
> Der Kopf von 020 sagt noch „auf KEINER Umgebung ausgeführt“ – laut Ege ist 020 auf Staging ausgeführt (nicht geprüft).

## Sitzung 2026-11-10 (25) – Creme-Hintergrund + 2px-Rahmen (nicht committet, nur lokal getestet)

- **Farben** (`src/styles/variables.css`): Hintergrund `#f8f6f0`, Karten `#fdfcf8`, Eingabefelder `#fffdf9`, Flächen
  `#f2efe7` / `#e8e4da`, Rahmen warmes Grau `#cfcabe` / `#a39e92`. Schrift unverändert `#111111`.
- **Rahmen**: neue Variable `--border-width: 2px`; 57 Umrisse (`border: 1px …`) in 8 CSS-Dateien darauf umgestellt.
  Bewusst 1px geblieben: Badges, Chip-Gruppe, Trennlinien in Karten (`border-top`).
- Halbtransparente Leisten (Kopfzeile, untere Navigation, Spiel-Leiste) creme statt weiß; `theme-color` in `index.html`.
- **Akzentfarben neu erzeugt** (`scripts/generateThemes.mjs` mit den neuen Flächen, `themes.css`): alle sechs bestehen die
  Kontrastprüfung, Grundtöne unverändert. „Connect“ im Schriftzug minimal dunkler (`--brand-blue-text: #2d6bd0`), weil es
  auf Creme nur 4.45:1 hatte.
- Tests: `tests/appearance.test.js` an die neuen Werte angepasst; `npm test` 461/464 (3 bekannte Fehlschläge, siehe
  Sitzung 30), Build ok. Optisch im Headless-Chrome geprüft (Sitzung 26).

## Sitzung 2026-11-10 (26) – Netzwerk-Bereich entfernt (nicht committet, nur lokal getestet)

- **Gelöscht:** `NetworkPage.jsx`, `SchoolDetailPage.jsx`, `ProjectDetailPage.jsx`, `SchoolCard.jsx`, `ProjectCard.jsx`;
  Handler `toggleProjectInterest` (AppStateContext); CSS `.legend`, `.info-card--dashed`; Texte `nav.network`,
  `network.*`, `school.*`, `project.*`, `discover.networkText`, `discover.schoolsCount`, `community.networkText`,
  `home.typeProject`, `home.suggestedProject` (de/en/tr).
- **Weiterleitung:** `/network/*` → `/discover` (`App.jsx`). Kacheln auf Entdecken/Community entfernt, Eintrag in der
  Entdecken-Unternavigation entfernt (in der Hauptnavigation stand „Netzwerk“ nie).
- **Angepasst:** Schulnamen auf Event-Detail, öffentlichem Profil und „Mein Bereich“ als Text statt Link; Startseite ohne
  Demo-Projekte/Projekt-Vorschlag; „Mein Bereich“ (nur Demo-Profile) ohne Projekte-Kachel und Demo-Projektliste;
  Kachelreihe `.stats` passt sich an 2 oder 3 Kacheln an.
- **Bewusst behalten:** echte Projekt-Mitwirkung (013) auf der Ideen-Detailseite; `src/data/schools.js` und `projects.js`;
  `getMyProjects`/`getProjectRecommendations` (jetzt ungenutzt).
- Tests: Router-Prüfung (alle `/network`-Adressen → `/discover`); Headless-Chrome 1280 + 390 px auf Start, Entdecken,
  Community, Events, Event-Detail, Profil, Mein Bereich, Chat, Spiele: keine `/network`-Links, 41 interne Links ohne 404,
  kein horizontales Scrollen, Creme + 2px bestätigt. `npm test` 461/464, Build ok.
- **Gefunden, nicht behoben:** Entdecken auf Desktop nutzt mit 2 Kacheln nur ⅔ der Breite; untere Navigation auf 390 px
  mit 7 Einträgen sehr eng.

## Sitzung 2026-11-10 (27) – Einstellungen, „Mein Bereich“, Community-Gruppen (nicht committet, nur lokal getestet)

- **Farbwahl unter Mein Bereich → Einstellungen entfernt.** Farbe nur noch über das Paletten-Symbol in der Kopfzeile
  (dessen Link „Mehr Einstellungen“ führte dorthin und ist entfernt). `AppearanceSettings.jsx` liegt ungenutzt im
  Repository (nie committet, deshalb nicht gelöscht). Sprachauswahl unverändert.
- **Hinweis „Events, Ideen und Projekte sind vorerst weiterhin Demo-Daten.“** unten in „Mein Bereich“ entfernt (nur
  echte Konten; Demo-Profile behalten ihren Demo-Hinweis). Der gleiche Satz steht weiter im DEMO-Tooltip, im
  Profil-Menü und auf der Konto-Karte.
- **Community → Projekt- und Eventgruppen** (`/community/groups`, `CommunityGroupsPage.jsx`,
  `src/lib/communityGroups.js`): listet die Projekt-/Eventräume aus dem Chat (014, `chat_list_rooms` – nur Gruppen, in
  denen man Mitglied ist), Filter Alle/Projekt/Event, Klick öffnet `/chat/rooms/:id` (Beiträge = Nachrichten).
  Karte „In Integration“ auf `/community` ersetzt. **Keine neue Tabelle, keine Migration.**
- **Entscheidung geändert (Ege, 2026-11-10):** Gruppenbeiträge sind nicht mehr „für den Pilot aus“.
- **Kerems Beiträge:** Kerems Codex-Version enthält keine gespeicherten Gruppen oder Beiträge (`groups: []`,
  `messages: []`, Branch `codex-version-1.0`) – nichts übernommen, nichts erfunden.
- Tests: `tests/communityGroups.test.js` (3); Headless-Chrome (Demo-Modus): Karte, Seite, Filter, Einstellungen.
  **Nicht** geprüft: Gruppenliste mit echtem Konto. `npm test` 464/467, Build ok.

## Sitzung 2026-11-10 (28) – Startseite schwarz + Flaggen-Logo (nicht committet, nur lokal getestet)

- **Startseite:** alle Texte `#000000` – nur innerhalb von `.home` (`pages.css`), gemeinsame Komponenten auf anderen
  Seiten unverändert. Begrüßungskarte jetzt heller Akzent-Ton (`--color-primary-tile`) mit Akzent-Rahmen statt voller
  Akzentfläche (schwarze Schrift wäre z. B. bei „Mitternacht“ unlesbar). Weiß geblieben: Haupt-Button und
  Rollen-Kennzeichen „Angemeldet“/„Organisierst du“ (auf voller Akzentfläche). Kopfzeile, Navigation, Fußzeile unverändert.
- **Logo-Kachel** (`layout.css`, `.brand-mark`): drei waagrechte Streifen `#000000` / `#DD0000` / `#FFCE00`, weiße
  runde Plakette mit dem bisherigen Globus-Symbol in Schwarz; Größe 35 × 35 px und Position unverändert.
  **Nicht** angepasst: `public/favicon.svg` und `src/components/Logo.jsx` (Profilauswahl) zeigen noch das alte Ring-Logo.
- Geprüft (Headless-Chrome, 1280 + 390 px, Ozeanblau/Mitternacht/Abendorange): 75 von 78 Texten schwarz, schwarze Texte
  ≥ 12.7:1, weiße Ausnahmen ≥ 4.8:1. `tests/appearance.test.js` prüft jetzt die Flaggen-Streifen. `npm test` 464/467.

## Sitzung 2026-11-10 (29) – Gruppen erst nach Admin-Freigabe (nicht committet, nur lokal getestet)

- **Keine Datenbank-Änderung nötig** – die Sperre steht schon in 014:
  `chat_create_project_room` nur für Ideen mit Status `collecting`/`review`/`planned` (= vom Admin freigegeben; nicht
  `submitted`, nicht `rejected`), `chat_create_event_room` nur für Staff und Events `planned`/`confirmed` (nicht `draft`,
  nicht `cancelled`); `chat_rooms` mit RLS und ohne direkte Tabellenrechte; eine Gruppe je Idee/Event (`on conflict`).
- **Frontend:** `src/lib/groupApproval.js` (gleiche Status-Listen), `GroupApprovalNotice.jsx`; Hinweis „Diese Gruppe kann
  erst erstellt werden, nachdem ein Admin …“ erscheint **nur nach einem Erstellungsversuch** (Ideenseite →
  `ProjectChatLink.jsx`; Chat-Moderation → Eventgruppe) – auch wenn der Server ablehnt (42501 bzw. P0002).
- Tests: `supabase/tests/014_group_approval_test.sql` lokal 16/16 OK (Fälle wartend, freigegeben, abgelehnt/abgesagt,
  keine Doppelten, direkter INSERT, Selbst-Freigabe, Admin-Funktion ohne Rechte, anon); `tests/groupApproval.test.js` (5,
  u. a. Status-Listen = SQL in 014); Headless-Chrome gegen lokale DB (Hinweis erst nach Klick, nicht auf Community/
  Gruppen/Chat). **Nicht** auf Staging geprüft. `npm test` 469/472, Build ok.

## Sitzung 2026-11-10 (30) – Git-Bestandsaufnahme, Doku, Analyse der roten Tests (keine Code-Änderung)

- Doku aktualisiert (dieser Abschnitt, Sitzungen 25–29, Kopf, Teststand) und `STAGING_RUNBOOK.md` (014/020-Stand laut
  Ege, 017–020 in der Reihenfolge, neue SQL-Tests, Tests G1–G4 für Gruppen).
- **Rote Tests – Ursache:** alle drei Tests sind veraltet, kein Fehler im Anwendungscode:
  - `tests/navigation.test.js` „genau sechs Hauptbereiche …“ und `tests/chat.test.js` „Navigation: /chat gehört zu
    Community …“: der Code hat inzwischen „Chatroom“ als **7.** Hauptbereich (`navigation.js`, eigener Bereich `chat`).
    In CHATROOM.md Abschnitt 11 Punkt 3 steht das noch als offene Frage. Die Tests prüfen den früheren Stand.
  - `tests/eventArchive.test.js` „008 K4“: 008 wurde geändert (abgesagt → archiviert erst, wenn Absage **und** Ende
    24 h vorbei sind; Entscheidung Ege 2026-11-09). Die Selbstprüfung in 008 hat dabei neue Meldungstexte bekommen; der
    Test sucht noch „Absage vor 25 h nicht archiviert“. Geprüft: geänderte 008 lokal fehlerfrei eingespielt
    (Laufzeit-Probe bestanden), `008_event_expiry_rules_test.sql` 17 × OK / 0 × FEHL.
- **Offen** (bekannt, nicht behoben):
  - ~~Tests oben anpassen bzw. Entscheidung „Chatroom eigener Hauptpunkt?“~~ → erledigt in Sitzung 31.
  - Untere Navigation mit 7 Einträgen auf 390 px eng; Entdecken-Kacheln auf Desktop nur ⅔ breit.
  - Favicon + `Logo.jsx` noch altes Logo; `AppearanceSettings.jsx` und Text `appearance.moreSettings` ungenutzt.
  - Status-Angaben veraltet: Kopf von `014_chat.sql` („NUR IM REPOSITORY“), CHATROOM.md („Weder auf Staging noch auf
    Live ausgeführt“) und `020` („auf KEINER Umgebung ausgeführt“) widersprechen der Aussage von Ege (014/020 auf
    Staging ausgeführt) – erst nach Prüfung auf Staging ändern.
  - 018 braucht 008 – 008 wurde auf Staging bewusst ausgelassen → vor 018/019 entscheiden.
  - Staging-Tests mit echten Konten für 014, 017, 018/019, 020 und die Gruppen-Freigabe.

## Sitzung 2026-11-10 (31) – Entscheidung Chatroom, drei veraltete Tests korrigiert (nur Tests + Doku)

- **Entscheidung (Ege, 2026-11-10):** „Chatroom“ ist **dauerhaft der siebte, eigenständige Hauptbereich** (`/chat`, in der
  Navigation vor „Spiele“). Vermerkt in [CHATROOM.md](CHATROOM.md) Abschnitt 11 Punkt 3. Die enge mobile Navigation
  (7 Einträge) wird später separat verbessert – weiterhin offen.
- **Korrigiert (nur Testdateien, kein Anwendungscode, keine Migration):**
  - `tests/navigation.test.js`: erwartet sieben Bereiche `home, discover, tutoring, community, chat, games, me` und prüft
    den Chat-Eintrag (`/chat`, `nav.chat`, Symbol `chat`).
  - `tests/chat.test.js`: `/chat`, `/chat/rooms/…`, `/chat/moderation` gehören zum Bereich `chat`; 7 Bereiche; `chat`
    vor `games`.
  - `tests/eventArchive.test.js` „008 K4“: erwartet die aktuellen Meldungstexte der 008-Selbstprüfung („Absage + Ende vor
    über 24 h nicht archiviert“, „abgesagtes künftiges Event vor seinem Termin archiviert“, „Absage vor 1 h archiviert
    (Termin vorbei)“) statt „Absage vor 25 h nicht archiviert“.
- **Ergebnis lokal:** `npm test` **472 / 472 bestanden, 0 fehlgeschlagen** (2026-11-10). Build zuletzt erfolgreich (Sitzung 29).
- **Weiterhin ausstehend (Staging, echte Konten):** 014 + 020 (laut Ege ausgeführt, nicht geprüft) – C0–C11,
  `014_chat_room_access_test.sql`, `014_group_approval_test.sql`, `020_chat_read_state_test.sql`, G1–G4; 017 (nicht
  ausgeführt) – B1–B8, `017_leaderboard_test.sql`; 018/019 (nicht ausgeführt, braucht Entscheidung zu 008);
  011–013 Funktionstests T1–T6, P1–P4, J1–J5. Siehe [STAGING_RUNBOOK.md](STAGING_RUNBOOK.md).
  Die grünen `npm`-Tests prüfen Logik, Verdrahtung und SQL-Texte – **nicht** das Verhalten einer echten Supabase-Datenbank.
