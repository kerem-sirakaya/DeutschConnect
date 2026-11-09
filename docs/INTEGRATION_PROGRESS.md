# DeutschConnect – Integrationsfortschritt

Plan: [FINAL_INTEGRATION_PLAN.md](FINAL_INTEGRATION_PLAN.md) · Branch `integration-v1` · Stufen 1–4 **lokal committet**
(`a7b50a3`), Stufe 5 noch uncommittet · **nichts gepusht, keine Migration ausgeführt, nichts veröffentlicht.**

Live-Stand der Datenbank (laut Ege, 2026-11-09): 001–007 ausgeführt · **008, 009, 010 NICHT ausgeführt** · 011, 012 nur Dateien.

Legende: ✔ erledigt und lokal geprüft · ◐ Code fertig, Live-Abnahme offen · ○ offen

| Stufe | Inhalt | Stand |
|---|---|---|
| 1 | Claude-Backend + Auth als Basis | ✔ unverändert (AuthContext, AppStateContext, Admin, Migrationen 001–010) |
| 2 | Codex-Design + Hauptnavigation | ✔ |
| 3 | Codex-Startseite/Dashboard | ✔ |
| 4 | Nachhilfe-Börse | ◐ 011 geprüft (Review unten), Staging-Test offen → im Konto-Modus noch nicht nutzbar |
| 5 | Profile + Statistiken | ◐ Code fertig, Migration 012 nicht ausgeführt |
| 6 | Projekte (Anträge/Mitglieder), Events-Optik, Gruppen | ○ – Gruppenbeiträge bleiben für den Pilot AUS (Entscheidung Ege) |
| 7 | Admin für neue Module, 24-h-Ausblendung abgelehnter Ideen | ○ |
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
