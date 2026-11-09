# DeutschConnect – Finaler Integrationsplan (Claude-Backend + Codex-Oberfläche)

Stand: 2026-11-09 · Branch: `integration-v1` · Fortschritt: [INTEGRATION_PROGRESS.md](INTEGRATION_PROGRESS.md)

Gemeinsamer Beschluss von Ege (Claude-Version) und Kerem (Codex-Version):

- **Claude-Version = technische Grundlage** (Supabase-Auth, relationale Tabellen + RLS, Admin-RPCs, Archivierung).
- **Codex-Version = Vorlage für Optik, Navigation und Nutzerfunktionen** (Startseite, Dashboard, Nachhilfe,
  Profile/Statistiken, Spiele, Community).
- Ergebnis: **eine** App, **eine** Anmeldung, **eine** Datenquelle. Kein Git-Merge der beiden Branches.

---

## 1. Ausgangslage (in Phase 1 geprüft)

| Branch | Commit | Inhalt |
|---|---|---|
| `main` | `23a6a0a` (gemeinsame Basis) | README, AGENTS, Designreferenzen |
| `claude-version-1.0` | `40b3f09` | Eges Version: React 19 + Vite 6 + react-router 7 + supabase-js, Migrationen 001–010, 267 Tests |
| `codex-version-1.0` | `124fc15` | Kerems Version: React 19 + Vite 7, Hash-Routing, REST + Edge Function `platform`, JSONB-Workspace, 147 Tests |
| `integration-v1` | `40b3f09` (= Claude) | **Arbeitsbranch der Integration** – bereits vorhanden, daher kein neuer Branch nötig |

Beide Originalbranches bleiben **unverändert**. Gearbeitet wird ausschließlich auf `integration-v1`, bisher **ohne Commit**.

Gelesen wurden: beide Blueprints, beide Manifeste, Codex-Anhänge unter `docs/integration/` und der tatsächliche
Quellcode (Codex über `git archive` in einen temporären Ordner, nicht ausgecheckt).

### 1.1 Warum kein Merge möglich ist

| Thema | Claude | Codex | Entscheidung |
|---|---|---|---|
| Routing | BrowserRouter (`/events`) | eigenes Hash-Routing (`#/events`) | **BrowserRouter** (Claude); Codex-Pfade werden als normale Routen nachgebaut |
| Daten | Tabellen + RLS + RPCs | ein privater JSONB-Workspace pro Projekt über Edge Function | **Tabellen + RLS** (Claude); Codex-Workspace/Edge Function wird **nicht** übernommen |
| Auth | `AuthContext` (supabase-js) | eigener REST-Auth-Service + Callback-Capture | **Claude-AuthContext**; keine zweite Auth |
| Rollen | `public.admins` + `is_admin()` | Server-Allowlist `DC_MODERATOR_IDS` | **`is_admin()`** (Claude); Allowlist entfällt |
| Profil | `first_name`, Schule, Klasse, privat | `displayName`, freiwillige Sichtbarkeit | Claude-Profil + **neue** freiwillige Freigaben (Stufe 5) |
| Event-Teilnahme | `registered`/`interested` | `joined`/… | Claude-Status |
| i18n | `t('a.b')` + `src/locales/*.json` | Objekt `t.a.b` aus 5 Schichten | **Claude-Mechanismus**; Codex-Texte werden übernommen und als Schlüssel eingetragen |
| CSS | Variablen + BEM-Klassen | globale Selektoren (`button`, `.button`) | Codex-**Werte** in Claude-Variablen, Codex-Muster als eigene Klassen in `modules.css` |

Bekannte Codex-Fehler **DC-I01** (Event-Vorschläge für Fremde sichtbar) und **DC-I02** (Anmeldung für vergangene
Events) werden **nicht** übernommen, weil die Claude-Regeln gelten (RLS 008: nur veröffentlichte, nicht archivierte
Events; Trigger 006: Anmeldung nur für zukünftige planned/confirmed-Events).

## 2. Zielarchitektur

```
main.jsx
 └ BrowserRouter
    └ LanguageProvider            (Claude-i18n, DE/TR/EN)
       └ AuthProvider              (Claude: Registrierung, Bestätigung, Login, Sitzung)
          └ AppStateProvider       (Claude: Profil, Events, Ideen; Demo ↔ Konto, ProfileGate)
             └ AdminStatusProvider (Claude: is_admin(), nur Anzeige)
                └ TutoringProvider (NEU: Nachhilfe, eigener Lade-/Fehlerzustand)
                   └ App → AppShell (NEU im Codex-Layout) → Seiten
```

Prinzipien:

1. **Jedes Modul = Tabellen + RLS + (bei Statuswechseln) SECURITY-DEFINER-Funktion** in einer eigenen,
   nummerierten Migration. Fachregeln liegen in der Datenbank, das Frontend prüft nur früher.
2. **Pro Modul ein Context bzw. Hook** mit Status `demo | loading | ready | error | notInstalled`.
   Fehlt eine Migration, zeigt nur dieses Modul einen Hinweis – der Rest der App läuft weiter.
3. **Erfolg erst nach Datenbank-Bestätigung**: Nach jeder Änderung wird neu geladen; Formulare leeren sich erst danach.
4. **Demo-Modus bleibt** (abgemeldet = fiktive Daten, deutlich markiert). Neue Module sind im Demo-Modus
   **nur lesbar** – keine lokal „simulierten“ Bestätigungen.
5. **Admin-Rechte nur im Backend** (`is_admin()` in jeder `admin_*`-Funktion). Ausblenden von Knöpfen ist nur Komfort.
6. **Datenschutz-Standard für Minderjährige**: Namen anderer sind standardmäßig unsichtbar; Freigaben sind
   freiwillig und standardmäßig aus; keine Kontaktdaten in Texten; keine privaten 1:1-Chats (AGENTS Regel 11).

## 3. Navigation (Codex-Struktur)

Fünf Hauptbereiche, unten (Smartphone/Tablet, schwebende Leiste) und oben in der Kopfleiste (Desktop ab 1050 px):

| Bereich | Route | Unterseiten (bestehende Claude-Routen bleiben gültig) |
|---|---|---|
| Start | `/` | persönliches Dashboard |
| Entdecken | `/discover` | `/events…`, `/ideas…`, `/network…` |
| Nachhilfe | `/tutoring` | `/tutoring/new`, `/tutoring/:id`, `/tutoring/:id/edit` |
| Community | `/community` | später Profile, Gruppen, Spiele (`/community/…`) |
| Mein Bereich | `/me` | `/me/interests`, `/me/settings`, `/login`, `/register`, `/about` |

Admin (`/admin…`) ist kein Hauptbereich; Zugang über das Profilmenü (nur bei `is_admin() = true`).
Der aktive Bereich wird aus der URL berechnet (`sectionForPath`, getestet). Browser-Zurück funktioniert über
echte URLs; Tabs stehen in `?tab=`.

## 4. Modul-Zuordnung

| Codex-Funktion | Claude-Grundlage | Weg | Stufe |
|---|---|---|---|
| Designsystem, Kopfleiste, Bottom-Nav | `variables.css`, `AppShell` | Codex-Werte/Struktur in Claude-Komponenten | 2 ✔ |
| Startseite/Dashboard | `HomePage` | Codex-Begrüßungskarte + Nachhilfe-Bereich, Claude-Daten | 3 ✔ |
| Nachhilfe-Börse | – (neu) | Migration **011** + `tutoringApi` + `TutoringContext` + 3 Seiten | 4 ✔ (Code) |
| Profile + Statistiken | `profiles` (privat) | Migration 012: `profile_visibility`/freiwillige Felder, `get_public_profile()`, Statistik-RPCs | 5 |
| Projekte: Anträge/Mitglieder/Abschluss | `ideas`, `idea_supports` | Migration 013: `project_members` (requested/accepted/declined/left), RPCs für Eigentümer | 6 |
| Events | Claude komplett | nur Codex-Optik | 6 |
| Gruppen/Beiträge, Meldungen, Sperren | – | Migration 014 (nur nach Freigabe, Moderation zuerst) | 6 |
| Admin für neue Module | `admin_*`-RPCs | Migration 015: Nachhilfe/Meldungen/Kontosperre + Seiten im Admin-Bereich | 7 |
| Schach + Herausforderungen | – | Migration 016: `chess_challenges`, `chess_games`, Zugprüfung serverseitig (Codex `_shared/chess.js` als Vorlage) | 8 |
| Symbol-Paare, Paper Flight, Bridge Runner | – | Spiele 1:1 aus Codex; Migration 017: `game_results` mit Plausibilitätsgrenzen, Bestenlisten-RPC, Opt-in | 8 |
| Benachrichtigungen | – | aus echten Datensätzen abgeleitet (offene Anfragen, Einladungen) – kein eigener Speicher | 9 |

## 5. Backend: vorhanden vs. neu

**Vorhanden (Claude, Migrationen 001–010):** Schulen, private Profile, Events + Anmeldungen (Kapazität, Zeitregeln),
Ideen + Unterstützungen (Moderation mit Erlaubnisliste), `admins`/`is_admin()`, `admin_*`-RPCs für Events/Ideen,
Archivierung (24 h nach Absage/Ende, stündlich per `pg_cron`), Admin-Kennzahlen.

**Neu in dieser Integration:**

| Migration | Inhalt | Status |
|---|---|---|
| `011_tutoring.sql` | `tutoring_entries`, `tutoring_requests`, `tutoring_saves`, `dc_has_contact_data()`, 5 RPCs, Selbstprüfung | **nur Datei – nicht ausgeführt, SQL nicht gegen eine Datenbank getestet** |
| 012–017 | siehe Abschnitt 4 | geplant |

### 5.1 Hinweis zur „24-Stunden-Bereinigung“

Geprüft: In Eges Code gibt es **keine** 24-h-Bereinigung für Projektvorschläge. Die vorhandene 24-h-Logik betrifft
**Events** (Migration 008/009: Archivierung 24 h nach Absage bzw. Ende, serverseitig per `pg_cron`).
Abgelehnte Ideen sind schon heute für andere unsichtbar (RLS-Erlaubnisliste, live **v3**); nur die Autor:in sieht sie
mit Hinweis „Nicht freigegeben“. Vorschlag für Stufe 7: Spalte `ideas.rejected_at` + Ausblenden 24 h nach Ablehnung
nach demselben `pg_cron`-Muster (kein Löschen; Moderationsverlauf bleibt erhalten). **Achtung:** Die Repo-Datei
`004_ideas_moderation.sql` enthält weiterhin v1 – nie erneut ausführen.

## 6. Reihenfolge (Phase 11) und Abnahme je Stufe

1. Claude-Backend + Auth als Basis ✔ (unverändert übernommen)
2. Codex-Designsystem + Hauptnavigation ✔
3. Codex-Startseite/Dashboard ✔
4. Nachhilfe ✔ (Code + Migration-Datei; Live-Abnahme offen)
5. Profile + Statistiken
6. Projekte, Events, Community
7. Admin-Anbindung aller Module
8. Spiele + Bestenlisten
9. Restliche Inkonsistenzen
10. Gesamttest mit mehreren echten Konten

Nach jeder Stufe: `npm test`, `npm run build`, Render-Smoke-Test aller Routen, Eintrag in INTEGRATION_PROGRESS.md.
Live-Tests mit Supabase nur nach Freigabe und mit fiktiven Testinhalten.

## 7. Rollback-Strategie

- **Code:** Originalbranches unverändert. Integration verwerfen: `git restore .` + neue Dateien löschen
  (`git clean -n` zuerst ansehen) oder einfach `git switch claude-version-1.0`. Nach künftigen Commits: einzelnen
  Commit mit `git revert <hash>` rückgängig machen (keine History umschreiben).
- **Datenbank:** Jede neue Migration ist additiv (neue Tabellen/Funktionen, bestehende unverändert).
  Rückbau von 011 – **nur nach Freigabe** und nur, wenn die Daten nicht mehr gebraucht werden:

  ```sql
  begin;
  drop function if exists public.tutoring_list_requests();
  drop function if exists public.tutoring_withdraw_request(uuid);
  drop function if exists public.tutoring_respond_request(uuid, boolean, text);
  drop function if exists public.tutoring_send_request(uuid, text);
  drop function if exists public.tutoring_list_entries();
  drop table if exists public.tutoring_saves, public.tutoring_requests, public.tutoring_entries;
  drop function if exists public.tutoring_touch_updated_at();
  drop function if exists public.dc_has_contact_data(text);
  commit;
  ```

  Das alte Frontend funktioniert auch **mit** 011 weiter (es kennt die Tabellen nicht). Das neue Frontend funktioniert
  **ohne** 011 weiter (Nachhilfe zeigt „Migration 011 fehlt“). Frontend- und Datenbank-Rollback sind also unabhängig.

## 7a. Deployment-Vorbereitung (Phase 13) – noch nichts veröffentlicht

| Punkt | Vorgabe |
|---|---|
| Build | `npm ci` → `npm run build` → Ordner `dist` (statisch) |
| Routing | BrowserRouter ⇒ Rewrite aller App-Pfade auf `/index.html` (Netlify `_redirects`: `/* /index.html 200`; Vercel `rewrites`). Assets nicht umleiten |
| Env (Build) | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (nur publishable!), `VITE_ENABLE_SIGNUP` |
| Auth-Redirect | Registrierung leitet auf `${origin}/login` zurück ⇒ Supabase **Site URL** + **Redirect URLs** um die HTTPS-Adresse ergänzen |
| E-Mail | Eigener SMTP-Versand für Schüleradressen (Supabase-Standardversand ist stark begrenzt) |
| Backend | Migrationen 001–011 (+ folgende) in Reihenfolge; `pg_cron` aktiv (009) |
| CORS | Supabase-API erlaubt Browserzugriff mit publishable Key; keine Edge Function nötig |
| HTTPS | Hoster liefert TLS; nur HTTPS-Adresse in Auth-Einstellungen eintragen |
| Monitoring | Fehler nur als Codes, ohne Mailadressen/Inhalte; Supabase-Logs |
| Rollback | vorherigen Deploy im Hoster wiederherstellen; DB siehe Abschnitt 7 |

Empfehlung: zuerst **geschlossene Beta** mit freigegebenen Testkonten, Registrierung danach wieder schließen.

## 8. Offene Entscheidungen (brauchen Ege/Kerem)

1. Sind die Migrationen **007–010 live**? (Grundlage für 011 – sonst zuerst diese.)
2. Darf **011** auf einer Kopie/Staging und danach live ausgeführt werden?
3. Gruppenbeiträge (Codex „Community-Räume“): mit Moderation freigeben oder für den Pilot weglassen?
4. Öffentliche Profile: Welche Felder dürfen Schüler:innen freiwillig teilen (Vorschlag: Vorname, Schule, Interessen,
   öffentliche Projekte; Standard: aus)?
5. Hosting-Anbieter (Netlify oder Vercel) und Beta-Testkonten.
