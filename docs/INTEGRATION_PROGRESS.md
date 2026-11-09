# DeutschConnect – Integrationsfortschritt

Plan: [FINAL_INTEGRATION_PLAN.md](FINAL_INTEGRATION_PLAN.md) · Branch `integration-v1` · lokale Commits: Stufen 1–4
(`a7b50a3`), Stufe 5 (`c15bfdf`), Stufe 6 (dritter Commit) · **nichts gepusht, keine Migration ausgeführt, nichts veröffentlicht.**

**Staging** (`DeutschConnect-Staging`, laut Ege, 2026-11-09): **001–007, 010, 011, 012, 013 erfolgreich ausgeführt** ·
008 und 009 bewusst ausgelassen · `admin_get_overview_stats()` vorhanden, Admin-Statistik funktioniert (von Ege geprüft).
**Nicht erneut ausführen.**

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

Legende: ✔ erledigt und lokal geprüft · ◐ Code fertig, Live-Abnahme offen · ○ offen

| Stufe | Inhalt | Stand |
|---|---|---|
| 1 | Claude-Backend + Auth als Basis | ✔ unverändert (AuthContext, AppStateContext, Admin, Migrationen 001–010) |
| 2 | Codex-Design + Hauptnavigation | ✔ |
| 3 | Codex-Startseite/Dashboard | ✔ |
| 4 | Nachhilfe-Börse | ◐ 011 auf Staging ausgeführt; Funktionstests offen; live nicht ausgeführt |
| 5 | Profile + Statistiken | ◐ 012 auf Staging ausgeführt; Funktionstests offen; live nicht ausgeführt |
| 6 | Projekte (Anträge/Mitglieder), Events-Optik, Gruppen | ◐ Mitwirkung: 013 auf Staging ausgeführt, Tests offen; Abschluss → Stufe 7; Projekt-/Event-Gruppen + Chat noch nicht portiert (siehe Sitzung 7) |
| 7 | Admin für neue Module, 24-h-Ausblendung abgelehnter Ideen | ○ Plan steht (unten, Sitzung 5) |
| 8 | Spiele + Bestenlisten | ○ |
| 9 | Inkonsistenzen beheben | ○ |
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
