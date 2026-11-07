# DeutschConnect – Übergabe zum Tagesabschluss

**Stand: 8. November 2026, Zeitzone Europe/Istanbul. Nächste Sitzung: 9. November 2026.**

Diese Datei ist der Einstieg für die nächste Sitzung. Zuerst [README.md](../README.md), [AGENTS.md](../AGENTS.md) und diese Übergabe lesen. Details zur Cloud stehen in [SUPABASE-SETUP.md](SUPABASE-SETUP.md). Ältere Phasen- und Moduldokumente beschreiben frühere Zwischenstände; ihre Aussagen „kein Backend/keine Konten“ sind keine aktuelle Bestandsaufnahme.

**Wichtig:** Die eigene Supabase-Einrichtung und der echte Anmeldeablauf sind bereits erfolgt. Nicht erneut ein Projekt anlegen, initialisieren oder ungeprüft migrieren. Der Tagesabschluss änderte ausschließlich Dokumentation und führte lokale Prüfungen aus: keine Features, Migrationen, Cloud-Änderungen, Deployments, Commits oder Pushes.

## 1. Projektvision und Entwicklungsziel

DeutschConnect ist eine von Schülern gestaltete, schulübergreifende Plattform für eigene Initiativen und konkrete Angebote: Events, freie Projekte, Nachhilfe, Interviews, Workshops, Austausch und Zusammenarbeit. Ausgangspunkt ist die Ernst-Reuter-Schule Ankara; Anka Bilim ist der vorgesehene erste Schulpartner. Eine tatsächlich durchgeführte Kooperation ist damit nicht belegt.

Das Produkt soll als persönliche Schul-App funktionieren: relevante Aktivitäten, passende Möglichkeiten und eigene Aufgaben schnell erreichen. Mobile-first, dunkles Navy, blaue Akzente, runde Karten, kompakte Navigation und vollständige deutsche, türkische und englische Oberfläche erhalten. Kein kommerzielles Nachhilfemodell, keine erfundenen Teilnehmerzahlen oder Partnerschaften. Die neun Referenzbilder liegen tatsächlich unter `design references/`; der in AGENTS genannte Pfad `docs/design-references/` existiert derzeit nicht. Nicht ohne Auftrag verschieben.

Primärer Maßstab bleibt eine kleine, verlässliche reale Zusammenarbeit zwischen Schulen. Laut Projektvorgabe endet die DIHK-Wettbewerbsfrist am **15. November 2026**. Bis dahin den belegbaren Ablauf priorisieren, keine weiteren Spiele oder großen Module vorziehen.

## 2. Aktueller Git-Branch und Repository-Status

- Arbeitsbranch: **`codex-version-1.0`**, nicht `main`.
- Lokaler HEAD: **`23a6a0a`**, Commit „the real stuff inside read me and agents“.
- Lokale Tracking-Referenzen: `origin/codex-version-1.0`; `main` zeigt ebenfalls auf diesen älteren Commit. Kein Fetch zum Tagesabschluss; die aktuelle GitHub-Seite wurde nicht unabhängig geprüft.
- Bei der Bestandsaufnahme: **13 bereits versionierte Dateien**, **115 unversionierte Dateien**. Mit dieser neuen Übergabe sind es **116 unversionierte Dateien**.
- Bereits vor diesem Auftrag geändert: `.gitignore`, `README.md`. Zusätzlich im Tagesabschluss geändert: `AGENTS.md`. Keine Änderungen wurden gestaged oder committet.

Unversionierte Dateien nach Erstellung dieser Übergabe:

| Bereich | Anzahl | Inhalt |
| --- | ---: | --- |
| Projektwurzel | 6 | `.editorconfig`, `.env.example`, `index.html`, `package.json`, `package-lock.json`, `vite.config.js` |
| `src/` | 82 | Anwendung, Komponenten, Daten, Sprachen und Styles |
| `scripts/` | 13 | Tests, Render-/Sprachprüfung und Offline-Build |
| `supabase/` | 7 | Konfiguration, Migration, SQL-Test, Function und gemeinsame Logik |
| `docs/` | 7 | Vorhandene Dokumente und diese Übergabe |
| `public/` | 1 | Statisches App-Icon |

**Sicherungsrisiko:** Die eigentliche Anwendung einschließlich Tests und Backend-Dateien ist noch nicht in der lokalen Git-Historie gesichert. Ein Commit nur dieser Markdown-Datei reicht nicht. Keine eigenständigen Commits oder Pushes durch Codex ausführen.

`.gitignore` schließt `.env.local`, weitere lokale `.env`-Dateien, `.npm-cache/`, `node_modules/`, `dist/` und `.temp` aus. `.env.example` ist eine leere Vorlage und darf versioniert werden. Die Prüfung bestätigt: `.env.local` ist nicht getrackt. Lokale CLI-Anmeldung liegt außerhalb der Anwendung und gehört ebenfalls nicht in Git. Git erfasst gespeicherte Dateien; ungespeicherte Editorpuffer wurden nicht geprüft.

**Manuelle Sicherung durch den Projektinhaber:** In GitHub Desktop dieses Repository und `codex-version-1.0` wählen, alle beabsichtigten Quellcode-, Test-, Dokumentations- und Supabase-Dateien kontrollieren, sensible/erzeugte Dateien ausgeschlossen lassen, dann selbst einen Commit erstellen und „Push origin“ ausführen. Eine Git-Sicherung ersetzt keine Cloud-Datensicherung oder sichere private Aufbewahrung lokaler Einstellungen.

## 3. Zusammenfassung des aktuellen Entwicklungsstands

| Bereich | Implementierung | Nachweis und Grenze |
| --- | --- | --- |
| Persönliche Oberfläche und Navigation | React/Vite-App mit fünf Hauptbereichen und Detailseiten | Lokale Tests und Renderprüfungen bestanden; keine vollständige visuelle Mobilabnahme |
| Gastdemo | Alex und Deniz mit unterschiedlichen Schulen, Interessen und Aktivitäten | Lokale Logik, Wiederherstellung und Isolation getestet; keine geräteübergreifenden Gastkonten |
| Echte Konten | Registrierung, E-Mail-Bestätigung, Passwort-Login, Refresh, Logout | Grundablauf einschließlich Neuladen und Rückkehr zur Demo live bestätigt; Token-Erneuerung nach Ablauf bisher nur automatisiert geprüft |
| Plattform-Speicherung | Geschützte Edge Function und gemeinsamer Cloud-Datenbestand | Echter Profil-Bootstrap nach Login sowie Datenbankrechte live belegt |
| Events, Projekte, Nachhilfe | Interaktive Listen, Details, eigene Inhalte, Teilnahme/Interesse und Verwaltung | Demo und serverseitige Regeln automatisiert geprüft; vollständige Zwei-Konten-Abnahme noch offen |
| Community und Gruppen | Freiwillige Profile, Mitgliedschaften, Gruppenbeiträge, Blockieren/Melden, Moderation | Backend implementiert und Betreiberzuordnung gesetzt; noch kein betreuter Mehrnutzer-Test |
| Schach und weitere Spiele | Lokales Schach, Herausforderungen, servergeprüfte Online-Züge; drei Minispiele | Regeln/Modelle getestet; Online-Partie mit zwei echten Geräten noch nicht abgenommen |
| Reale schulische Wirkung | Plattform kann Vorbereitung unterstützen | Keine durchgeführte Veranstaltung, bestätigte Schulkooperation oder Leistungsstatistik nachgewiesen |

„Implementiert“ bedeutet vorhandenen Code. „Automatisiert geprüft“ bedeutet die jeweils genannten lokalen Tests. „Live bestätigt“ bedeutet API-/Datenbanknachweis oder ausdrücklich bestätigten persönlichen Nutzertest. Diese Nachweisarten nicht vermischen.

## 4. Kürzlich durchgeführte Änderungen, soweit nachvollziehbar

Ohne einzelne Feature-Commits lässt sich der uncommittete Stand nicht lückenlos zeitlich zuordnen. Aus Quellcode und unmittelbar vorausgehender Sitzung sind diese Arbeiten belegt:

1. Bestehende App um persönliche Demo-Ansichten, Nachhilfe-Börse, freie Projekte, konkrete Initiativen, Community, Gruppen und Spiele erweitert. Vorhandene Gestaltung und drei Sprachen erhalten.
2. Lokale Speichergrenze, Wiederherstellung, Web Locks, tabbezogene Entwürfe und Konfliktprüfungen eingeführt.
3. Eigenständiges Supabase-Backend unabhängig von Eges Version aufgebaut; keine Supabase-SDK-Abhängigkeit ergänzt.
4. Lokale Projektkonfiguration gesetzt, echten Login direkt unter **Mein Bereich → Anmelden** erreichbar gemacht. Fehlende Konfiguration erscheint nur als kurze Kontoseiten-Meldung; technische Diagnose nur in der Entwicklungskonsole.
5. Nach ausdrücklicher Freigabe Migration angewendet, `platform` bereitgestellt, Auth-Adressen und Passwortvorgabe gesetzt; Origin-Liste und nach gesonderter Zustimmung Betreiber-Moderation konfiguriert.
6. Erneuter Bestätigungsversand erhält dieselbe Frontend-Rücksprungadresse wie die Registrierung.
7. Tatsächlich gemeldeten Fehler korrigiert: `#error=access_denied&error_code=otp_expired` wurde als Route behandelt und zeigte 404. Solche Rücksprünge führen jetzt zur Kontoseite mit übersetzter Erklärung. URL-Tokens werden entfernt; ungeprüfte Fehlerbeschreibungen werden nicht angezeigt. Ein bereits gültiger Zugang wird durch einen alten Link nicht gelöscht.
8. Passwort-Anmeldung und Bestätigungsversand in der Oberfläche erklärt; Versandbegrenzungen verständlich übersetzt. Auth-Regressionsprüfungen ergänzt.
9. Projektinhaber bestätigte zuletzt ausdrücklich: nach Neuladen weiterhin angemeldet; nach Abmelden wieder Gastdemo mit Demo-Profilumschalter.

**Dieser Abschlussauftrag selbst:** neue Übergabedatei, Leseregel in AGENTS, Aktualisierung veralteter Statusangaben und Dokumentationsverweise sowie erneute lokale Prüfungen. Kein Anwendungscode geändert.

## 5. Tatsächlich funktionierende Features

### Live mit dem eigenen Betreiber-Testkonto bestätigt

- Echte Registrierung und Empfang einer Bestätigungs-E-Mail.
- Bestätigte E-Mail und Auth-Sitzung serverseitig nachgewiesen; der später erneut verwendete Link meldete `otp_expired`.
- Normale Anmeldung mit registrierter E-Mail und Passwort. Bei diesem Login wird keine weitere E-Mail versandt.
- Geschützter Plattformstart: ein Workspace, ein echtes Profil und ein gespeicherter Bootstrap-Befehl wurden gelesen; keine Übernahme der Demo-Personas.
- Sitzung bleibt nach Neuladen erhalten; Abmelden führt zurück zur Gastdemo. Diese beiden Browserergebnisse hat der Projektinhaber persönlich bestätigt.
- Migration, Edge-Bereitstellung, Auth-Konfiguration, Zugriffssperren und Betreiber-Moderationskonfiguration sind belegt. Eine gesetzte Moderationsrolle ist noch kein Nachweis einer praktisch durchgespielten Moderation.

### Lokal und automatisiert geprüft

- Profilabhängige Dashboard-Listen, Empfehlungen und Einstellungen, Sprachwechsel und Sprachspeicherung.
- Events entdecken/filtern, Details öffnen, Interesse und Demo-Teilnahme verwalten.
- Projekte erstellen, bearbeiten, zurückziehen/entfernen; Interesse, Mitwirkungsanfrage, Entscheidung und Mitgliedschaft unterscheiden.
- Nachhilfeangebote/-gesuche erstellen, suchen/filtern, bearbeiten/schließen/entfernen, vormerken und private Kontaktentwürfe speichern.
- Interviews und andere Team-Vorschläge entdecken, Interesse vormerken und eigene Ideen auch ohne festes Format erstellen.
- Lokale Gruppenbeiträge, Meldungen, Blockierungen und freiwillige Verzeichnisfreigabe; serverseitige Rechte dazu in Unit-Tests.
- Schachregeln, Zugrecht und Herausforderungen; Brückenläufer, Papierflug und Symbolpaare; lokale Bestwerte.
- Wiederherstellung beschädigter Demo-Daten und Konfliktvermeidung zwischen Tabs. Offline-Test für tatsächlich gebaute statische Dateien.

## 6. Unfertige oder nur demonstrierte Features

- Gastdaten bleiben auf den jeweiligen Browser beschränkt. Demo-Profilwechsel ist keine Anmeldung. Lokale Meldungen werden nicht einer echten Moderation zugestellt.
- Projekte, Nachhilfe, Eventteilnahme, Gruppenkommunikation, Moderation, Schach und Anerkennungen sind backendseitig implementiert, aber noch nicht vollständig mit zwei echten Konten beziehungsweise Geräten abgenommen.
- Nachhilfe-Kontaktentwürfe werden auch im Kontomodus nicht als Nachricht verschickt; keine privaten Direktnachrichten und keine Zahlungen.
- Interviews, Workshops und Austausch sind vorgeschlagene Formate. Keine Interviewproduktion, bestätigten Termine oder Teilnehmer behaupten.
- Anerkennungen verlangen moderierte Anwesenheitsnachweise aus mindestens zwei angegebenen Schulen; keine echten Auszeichnungen als bereits erteilt darstellen.
- Kein Frontend-Ablauf zum Zurücksetzen eines vergessenen Passworts; keine öffentliche Website-Veröffentlichung, Push-Nachrichten oder vollständige native/PWA-App.
- Für beliebige Schüleradressen ist ein geeigneter E-Mail-Versand noch einzurichten. Der bisherige Test nutzte die eigene autorisierte Betreiberadresse.
- Früher offene Arbeiten an Cloud-Einrichtung und persönlichem Auth-Test sind abgeschlossen. Offen ist die inhaltliche Zusammenarbeit zwischen getrennten Konten; es gibt keine laufende Migration oder ausstehende Berechtigungsfreigabe aus dieser Sitzung.

## 7. Technische Architektur und wichtige Dateien

**Stack:** React, Vite, JavaScript/JSX und CSS. Keine Router-, Supabase-SDK- oder zusätzliche UI-Bibliothek. Aktuell lokal installiert: React/React DOM **19.3.1**, Vite **7.3.7**, React-Plugin **5.2.0**; Node **26.13.0**, npm **11.20.0**. `package.json` enthält Versionsbereiche; `package-lock.json` sichert die Auflösung. Keine Neuinstallation zum Tagesabschluss.

```text
React / Hash-Routing
  ├─ Gast: DemoContext → localRepository → Browserspeicher
  └─ Konto: AccountContext → Supabase-Service → Auth + Edge Function
                                             └─ gefilterte Daten / dc_commit → PostgreSQL
```

| Aufgabe | Wichtige Dateien |
| --- | --- |
| Einstieg und Provider | `src/main.jsx`: LanguageProvider → AccountProvider → DemoProvider → App |
| Routing | `src/App.jsx`: eigene Hash-Routen, Detailansichten, Rücksprungziele und Schutz ungespeicherter Eingaben |
| Navigation und UI | `src/components/Navigation.jsx`, `ModuleNavigation.jsx`, `UI.jsx`, Karten, FormFields, ActionButton; `src/styles/` |
| Personalisierung | `src/data/personalArea.js`, `matching.js`, `demoState.js`, `modules.js`; regelbasiertes Matching nach Schule, Interessen, freien Themen und Aktivität |
| Demo und Speicherung | `src/state/DemoContext.jsx`, `localRepository.js`, `pageMemory.js`, `usePageMemory.js` |
| Konto-Zustand | `src/state/AccountContext.jsx`: getrennte echte Daten, serialisierte Befehle, Revisionsschutz, Polling ca. alle vier Sekunden bei sichtbarer Seite |
| Auth-/API-Grenze | `src/services/supabase.js`: Auth-/REST-Aufrufe per fetch, Session-Refresh, Callback-Behandlung und Function-Aufrufe |
| Sprachen | `src/i18n/LanguageContext.jsx`, `accountCopy.js`, `src/locales/{de,tr,en}.json` und Unterordner `modules`, `quality`, `personal`, `platform` |
| Inhalte | `src/pages/Home.jsx`, `Events.jsx`, `EventDetails.jsx`, `EventNew.jsx`, `Ideas.jsx`, `IdeaDetails.jsx`, `IdeaSubmit.jsx`, `Discover.jsx`, `Network.jsx` |
| Nachhilfe und Community | `src/pages/Tutoring*.jsx`, `Community.jsx`, `Moderation.jsx`, `Achievements.jsx`; zugehörige Komponenten |
| Persönlicher Bereich | `src/pages/MyArea.jsx`, `PersonalSettings.jsx`, `Account.jsx` |
| Spiele | `src/pages/Games.jsx`, `src/games/ChessBoard.jsx`, `ChessLobby.jsx`, `ArcadeGame.jsx`, `MemoryGame.jsx`, `arcade.js`, `offline.js` |
| Backend | `supabase/functions/platform/index.ts`, `_shared/platform.js`, `_shared/social.js`, `_shared/chess.js` |
| Datenbank und Konfiguration | `supabase/migrations/202611070001_platform.sql`, `supabase/tests/security.sql`, `supabase/config.toml` |
| Prüfungen/Build | `scripts/*.test.mjs`, `check-locales.mjs`, `check-render.mjs`, `check-offline.mjs`, `offline-build.mjs`, `vite.config.js` |

Hauptnavigation: **Start, Entdecken, Nachhilfe, Community, Mein Bereich**. Wichtige Ziele: `#/me/account`, `#/events/all`, `#/ideas/new`, `#/discover/interviews`, `#/tutoring`, `#/community/rooms`, `#/community/games`. Die bisherigen Event-/Ideen-/Netzwerk-Routen bleiben erhalten. Inhalte sind nicht drei getrennte Websites; eigene Texte bleiben in ihrer Originalsprache und werden nicht automatisch übersetzt.

Speicherung: Demo-Snapshot `deutschconnect.demo.v1`, Original-Sicherungen `deutschconnect.demo.v1.recovery.*` und Sprachpräferenz `deutschconnect.language` in localStorage. Aktive Persona `deutschconnect.demo.persona` und Entwürfe/Filter `deutschconnect.page.v1:<profile>:<scope>` in sessionStorage. Auth-Sitzungen haben einen eigenen projektbezogenen localStorage-Schlüssel; keine Tokenwerte dokumentieren. Echte Plattformdaten werden im Konto-Context gehalten und auf dem Server gespeichert, nicht automatisch aus der Demo importiert.

Projektinteresse, Anfrage und angenommene Mitgliedschaft sind getrennt. Ebenso Event-Vorschlag, Betreiberfreigabe, Anmeldung und tatsächliche Anwesenheit. Themenraum-Mitgliedschaften werden gespeichert; Projekt-/Eventgruppenrechte werden aus tatsächlichen Beziehungen abgeleitet. Gruppenbeiträge sind keine Direktnachrichten. Schach speichert Koordinatenzüge und rekonstruiert die Stellung serverseitig.

## 8. Supabase-Einrichtungsstatus

**Eigenes Zielprojekt:** „DeutschConnect - Codex Demo“, Referenz `gdwxitcwtzkyfspjfoiw`. Eges Projekt wurde nicht verändert. Nachweise stammen aus der vorausgehenden freigegebenen Einrichtung und den persönlichen Nutzertests; zum Tagesabschluss wurden keine Cloud-Schreibaktionen oder erneuten Live-Tests ausgeführt.

| Prüfung | Stand und Nachweis |
| --- | --- |
| Lokale Verbindung | `.env.local` vorhanden und ignoriert; bestehende Konfigurationsprüfung erkennt die Verbindung. Zum Tagesabschluss erneut nur Status, keine Werte, geprüft. |
| SQL-Migration | `202611070001_platform.sql` nach Prüfung/Trockenlauf erfolgreich angewendet und in der Migrationshistorie erfasst. |
| Edge Function | `platform` mit drei gemeinsamen Modulen über die Supabase-API bereitgestellt. Kein Docker erforderlich gewesen. |
| Auth | E-Mail-Anmeldung und Registrierung erlaubt, Bestätigung verpflichtend, Mindestpasswortlänge zwölf Zeichen. |
| Weiterleitungen | Site URL `http://127.0.0.1:5173`; erlaubt sind localhost/127.0.0.1 mit Ports 5173 und 4173. Keine öffentliche Testdomain eingerichtet. |
| Origins und Moderation | Vier lokale Origins serverseitig gesetzt. Betreiberkonto nach verifizierter Identitätszuordnung und gesonderter ausdrücklicher Zustimmung als Moderator konfiguriert. |
| Echter Nutzerablauf | Registrierung, E-Mail-Empfang/Bestätigung, Passwort-Login, Plattformstart, Neuladen und Logout zurück zur Demo belegt. |
| Zwei Benutzer/Geräte | Noch nicht abgenommen. Zweite kontrollierte Adresse, geeigneter E-Mail-Versand und für reale Geräte erreichbare freigegebene Testadresse fehlen als geprüfter Gesamtaufbau. |

Erforderliche Variablen – **nur Namen und Status**, keine Schlüsselwerte:

| Variable | Konfigurationsstatus |
| --- | --- |
| `VITE_SUPABASE_URL` | Lokal vorhanden und gültig |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Lokal vorhanden und akzeptiert; öffentlich, trotzdem hier kein Wert |
| `VITE_SUPABASE_ANON_KEY` | Unterstützte Alternative, lokal nicht benötigt |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Im Edge-Backend bereitgestellt; nur Serververwendung |
| `DC_ALLOWED_ORIGINS` | Serverseitig gesetzt |
| `DC_MODERATOR_IDS` | Serverseitig gesetzt; keine Konto-UUID hier dokumentiert |
| `SUPABASE_ACCESS_TOKEN` | Keine Frontendvariable; administrative CLI-Anmeldung erfolgt separat. Anmeldung kann in einer neuen Sitzung abgelaufen sein. |

Die offizielle CLI **3.0.0** liegt im ignorierten `.npm-cache/`, nicht als React-Abhängigkeit oder garantierte globale Installation. Benutzeranmeldung wurde persönlich bestätigt; keine Anmeldelinks, Codes, Passwörter oder CLI-Token übernehmen.

**Datenmodell:** Es gibt nur zwei eigene SQL-Tabellen:

- `dc_workspace`: `id` (einziger erlaubter Wert 1), `revision`, `payload` (JSONB), `updated_at`.
- `dc_commands`: `actor_id`, `command_id`, `created_at`; Primärschlüssel aus Actor und Command. Einzige SQL-FK-Beziehung: `actor_id → auth.users.id`, mit Cascade für das Befehlsprotokoll.
- `dc_commit(...)`: privilegierter atomarer RPC mit globaler Transaktionssperre, erwarteter Revision und Erkennung wiederholter Befehle.

Profile, Schulen, Events, Teilnahmen, Projekte und sämtliche Module liegen innerhalb des JSON-Payloads. Dazu gehören Nachhilfe, Interessen, private Kontaktentwürfe, Freigaben, Gruppen, Nachrichten, Meldungen, Blockierungen, Herausforderungen, Schachpartien und Anerkennungen. Es gibt **keine normalisierten Modul- oder Chat-Tabellen**.

**Berechtigungen:** RLS auf beiden Tabellen; keine individuellen `CREATE POLICY`-Regeln. Browserrollen `anon` und `authenticated` haben keine direkten Tabellen-/RPC-Rechte. Nur das Backend verwendet die Serverrolle. Am Gateway ist `verify_jwt=false` bewusst gesetzt; der Handler prüft jeden Bearer-Token über Auth `/user`, verlangt bestätigte E-Mail, validiert Eigentum und Gruppenrechte und liefert eine gefilterte Benutzersicht. Moderatorrechte kommen aus der serverseitigen Liste, nicht aus frei bearbeitbaren Profildaten.

## 9. Bekannte Bugs und technische Risiken

- **Behoben:** 404 nach abgelaufenem/verwendetem E-Mail-Link, fehlende explizite Rücksprungadresse beim erneuten Versand und schwer auffindbarer Login. Keine offene gegenteilige Nutzermeldung am Sitzungsende.
- **Noch zu prüfen:** echte Mehrnutzerabläufe, mobile Layouts/Touch, Zugriffsrechte bei gleichzeitigen Aktionen, Moderation und Browser-/Offline-Szenarien auf realen Geräten.
- **E-Mail-Versand:** kein eigener SMTP-Dienst eingerichtet. Der Supabase-Standardversand ist eingeschränkt und für beliebige Schüleradressen nicht ausreichend. Bestätigung nicht als Abkürzung deaktivieren. Für bereits bestätigte Konten ist erneuter Bestätigungsversand keine Login-Voraussetzung.
- **Architektur:** gesamter JSON-Datenbestand und globale Schreibsperre; begrenzte Skalierung, keine SQL-Fremdschlüssel für Beziehungen im JSON, keine Lasttest-/Pagination-Abnahme. Keine automatische JSON-Kontodatenbereinigung beim Löschen eines Auth-Kontos. Aufbewahrung, endgültiges Löschen und Cloud-Backups benötigen Betreiberregeln.
- **Sicherheit/Betrieb:** privilegierte Edge Function ist die zentrale fachliche Zugriffsschranke; RLS allein fängt Fehler ihrer Datenprojektion nicht benutzerspezifisch ab. Browser-Tokens statt HttpOnly-Cookies erfordern XSS-Schutz. Kontaktfilter erkennen nicht jede verschleierte Angabe. Schulzugehörigkeit ist Selbstauskunft; gesetzte Moderation beweist keine tatsächlich besetzte Aufsicht.
- **Demo:** ohne Web Locks werden Schreibaktionen absichtlich verweigert; Browserdaten sind keine dauerhafte Datensicherung. Alte Tabs/Versionen können Konflikte verursachen. Nicht destruktiv „bereinigen“.
- **Spiele/Offline:** keine Schachuhr, komplexe Turnier-Sonderfälle nur teilweise behandelt. Offline-Cache speichert statische Ressourcen, keine Kontodaten oder API-Antworten; kein Offline-Mehrnutzerbetrieb.
- **Werkzeuge:** Standard-Vite-Konfigurationsloader scheiterte hier früher an eingeschränkten Windows-Verzeichnisrechten. Geprüfter Ausweg ist `--configLoader native`. Build erfolgreich mit nicht blockierender Warnung zum ca. 501,11-kB-JavaScript-Bundle (gzip ca. 153,34 kB).
- **Dokumentation/Git:** frühere Phasenberichte sind historisch; unversionierter Anwendungscode ist das dringendste Sicherungsrisiko. Git meldet bei README eine LF/CRLF-Konvertierungswarnung; `git diff --check` meldet keinen Fehler.

## 10. Testergebnisse und noch ausstehende Prüfungen

Zum Tagesabschluss am 8. November erneut tatsächlich ausgeführt:

| Prüfung | Ergebnis |
| --- | --- |
| `npm.cmd test` | **83 bestanden**, 0 fehlgeschlagen, 0 übersprungen |
| `npm.cmd run check` | **701 Texte je Sprache**, gleiche Schlüssel und gültige Zeichenkodierung |
| `npm.cmd run check:render` | 86 Demo-Routen je Persona/Sprache; zusätzlich konfigurierte/unverfügbare Anmeldung, zwei Bestätigungsfehler, Projekt-/Recovery-Zustände, 19 Kontoansichten und drei Schachbretter je Sprache erfolgreich |
| `npm.cmd run build -- --configLoader native` | Erfolgreich; oben dokumentierte Größenwarnung |
| `npm.cmd run check:offline` | Fünf echte Build-Ressourcen ohne simuliertes Netz verfügbar; private/API-Anfragen ausgeschlossen |
| `node --check supabase/functions/platform/index.ts` | Syntaxprüfung erfolgreich; kein Ersatz für einen Deno-Integrationstest |
| `git diff --check` | Erfolgreich; CRLF-Hinweis siehe oben |

Vorausgehende Live-Nachweise: Auth-Einstellungen HTTP 200; erlaubter Function-Preflight 200; anonyme/gefälschte Tokens 401; fremde Origin 403; Tabellen-/RPC-Zugriffe gesperrt. Sieben SQL-Sicherheitsbedingungen waren wahr, pgTAP-Datei wurde transaktional ausgeführt. Ein realer Profil-Bootstrap wurde gespeichert. Die persönlichen Auth-Schritte hat der Projektinhaber selbst getestet und bestätigt.

Die automatischen Renderprüfungen sind keine Klick-, Fokus-, Screenshot- oder Mobiltests. Der Offline-Test ist keine echte Handy-Flugmodus-Abnahme. Ein längerer Live-Test bis zum Ablauf eines Access-Tokens und dessen Erneuerung ist noch offen; erfolgreiches Neuladen allein belegt diesen Refresh nicht. Die Browsersteuerung wurde vorher sicherheitsbedingt beendet; daraus keinen erfolgreichen agentengesteuerten Browser-Test ableiten. Die Nutzerbestätigung des Auth-Ablaufs bleibt ein eigener gültiger Nachweis.

## 11. Zusammenarbeit mit Eges Claude-Version

Nach Angaben des Projektinhabers entwickelt Ege parallel mit Claude und Supabase und hat eine Anmeldung demonstriert. **Sein Quellcode, Schema und Berechtigungsmodell wurden hier nicht geprüft.** Unsere Version bleibt eigenständig nutzbar; keine Änderungen an seinem Projekt.

Voraussichtlich wiederverwendbar: visuelle Komponenten/CSS, drei Sprachkataloge, Hash-Routen, persönliche Selektoren und Matching-Regeln, Formulare, getrennte Teilnahmezustände, getestete Demo-Speichergrenze und Teile der Geschäftsregeln. Die Übernahme ist erst nach Vergleich zu entscheiden.

Vor einer Zusammenführung vergleichen:

1. Auth-Projekt, Benutzer-UUIDs, Profil-/Schulbeziehungen, Identitätsprüfung, Einwilligungen und freiwillige Freigaben. Gleiche E-Mail nicht ungeprüft als Erlaubnis zum Datenmerge behandeln.
2. Unser JSON-Snapshot gegenüber eventuell normalisierten Tabellen; vorhandene Migrationen und Namen nicht blind zusätzlich anwenden. ID-Typen, Beziehungstabellen und Datenübernahme ausdrücklich abbilden.
3. Events: Vorschlag/Freigabe, Interesse/Anmeldung/Anwesenheit; Projekte: Interesse/Anfrage/Mitgliedschaft, Planungsstand getrennt von Lebenszyklus. Entsprechende Modelle für Nachhilfe, Gruppen, Meldungen und Anerkennungen vereinheitlichen.
4. Serverseitige Rollenliste/Edge-Projektion gegenüber Eges tatsächlichen RLS- und Rollenregeln. Keine unsichere Mischung aus direkten Tabellenzugriffen und privilegiertem Snapshot-API.
5. Auth-Callback/implicit Tokens gegenüber gegebenenfalls PKCE/SDK; Sitzungsablage, Refresh, Logout und Fehlerbehandlung.
6. Unser API-Protokoll 1, Snapshot-Revisionen, Idempotenz und Polling gegenüber seinen Schnittstellen beziehungsweise eventueller Realtime-Nutzung. Ebenso Zugfolgen/Revisionen/Remisregeln für Schach.
7. Routing, CSS, Sprachschlüssel, Originaltexte, Löschung/Aufbewahrung, Backups und Tests.

Vorgehen: beide Code-Stände sichern; Code und Migrationen ohne Geheimnisse erhalten; Vergleichsmatrix und Datenvertrag schreiben; in isolierter Kopie einen kleinen Ablauf integrieren und prüfen. Noch kein blindes Zusammenführen von Produktionsdaten oder Auth-Nutzern. [INTEGRATION.md](INTEGRATION.md) ist die historische Grundlage, kein bereits abgestimmter gemeinsamer Backend-Vertrag.

## 12. Priorisierte nächste Entwicklungsschritte

| Priorität | Kleiner überprüfbarer Schritt | Zuständigkeit/Voraussetzung |
| --- | --- | --- |
| P0 | Aktuellen Code und Dokumentation kontrolliert committen und pushen | Projektinhaber; keine automatischen Git-Schreibaktionen |
| P1 | Zwei echte Konten in getrennten Browserkontexten anmelden; Identität und Datenisolation prüfen | Codex kann planen/prüfen; Projektinhaber benötigt kontrollierte zweite autorisierte E-Mail-Adresse und übernimmt Postfach/Passwort |
| P1 | Ein freies Testprojekt A erstellen, B entdeckt/es anfragt, A nimmt an; Reload in beiden Konten | Mit eindeutig bezeichneten Testinhalten und Zustimmung zum Test; keine erfundenen echten Aktivitäten |
| P1 | Eine Projektgruppe: B darf nach Annahme lesen/schreiben; nach Austritt kein Zugriff; Meldung/Moderation/Blockierung prüfen | Zwei kontrollierte Konten, Betreiber verfügbar |
| P2 | Nachhilfeeintrag, Eventvorschlag/Freigabe/Teilnahme und eine kurze Schachpartie zwischen den Konten abnehmen | Nach stabilem Kernablauf, konkrete Ergebnisse dokumentieren |
| P2 | Tatsächlicher Zwei-Geräte-Test über geeignete HTTPS-Testadresse; mobile Navigation und Touch prüfen | Erreichbare Adresse, passende Origins/Redirects; externe Konfiguration oder Veröffentlichung nur nach konkreter Freigabe |
| P2 | Versand an weitere Schüleradressen, Löschung/Aufbewahrung, Moderationsverantwortung und Backups abstimmen | Projektinhaber/Schulen; SMTP-Zugangsdaten nur beim Anbieter/Supabase, keine Geheimnisse im Chat |
| P3 | Eges Code/Migrationen lesen und Vergleichsmatrix erstellen | Zugriff vom zweiten Team; zunächst lesend, keine Merge-/Cloud-Aktionen ohne Auftrag |
| Danach | Belegbaren kleinen Schul-Pilot für die Frist vorbereiten; weitere Features zuletzt | Organisatorische Zusagen und echte Ergebnisse getrennt dokumentieren |

Reihenfolge beibehalten: Stabilität → Identitäten → Datenhaltung → echte Zusammenarbeit → Bedienbarkeit/Personalisierung → Integration → zusätzliche Spiele. Bereits erfolgreich eingerichtete Auth nicht erneut aufbauen.

## 13. Konkrete erste Aufgabe für morgen

Nach der manuellen Git-Sicherung: **einen Zwei-Konten-Projektablauf auf demselben Rechner in zwei getrennten Browserkontexten abnehmen**. Das ist der kleinste nächste Nachweis echter Zusammenarbeit ohne sofortige Veröffentlichung.

1. README/AGENTS/Handoff lesen, Branch und Arbeitsstand prüfen; keine erneute Migration oder Projekterstellung.
2. Vorhandene Anmeldung kurz prüfen. Zweite kontrollierte, vom Versand unterstützte Testadresse festlegen. Falls dafür SMTP oder externe Rechte fehlen, diese Voraussetzung konkret mit dem Projektinhaber klären; Bestätigung nicht abschalten und nicht allen Testkonten Betreiberrechte geben.
3. A erstellt ein klar als Test bezeichnetes Projekt, B findet es und stellt eine Anfrage. A akzeptiert; beide sehen die passende persönliche Zuordnung nach Neuladen. Fremde Bearbeitung bleibt gesperrt.
4. Erst danach Gruppenbeiträge und Mitgliedschaftsentzug prüfen. Ergebnisse mit Erwartung, tatsächlichem Verhalten und nötigen Fehlerkorrekturen dokumentieren. Nur reproduzierte Fehler gezielt beheben.
5. Anschließend den gleichen Ablauf auf zwei Geräten planen. **127.0.0.1 bezeichnet auf jedem Gerät das jeweilige Gerät**, nicht den Entwicklungsrechner. Die aktuell freigegebenen Loopback-Adressen allein reichen daher nicht. Eine geeignete erreichbare Testadresse samt Auth-/Origin-Konfiguration braucht einen separaten konkreten Schritt und gegebenenfalls Freigabe.

Erfolgskriterium des ersten Tests: zwei nachweislich getrennte Konten sehen denselben Serverdatensatz, behalten aber unterschiedliche persönliche Beziehungen und Berechtigungen. Zwei Browserkontexte auf einem Rechner belegen zunächst nur den Mehrkontenbetrieb. Als **geräteübergreifend abgenommen** gilt der Ablauf erst nach erfolgreicher Wiederholung auf zwei tatsächlichen Geräten.

## 14. Befehle zum lokalen Starten und Testen

Im vorhandenen Projektordner arbeiten. Abhängigkeiten sind bereits vorhanden; nicht unnötig neu installieren. Vor einem Serverstart prüfen, ob die Adresse schon läuft; bestehende Prozesse nicht pauschal beenden.

```powershell
git branch --show-current
git status --short
npm.cmd run dev -- --configLoader native --port 5173 --strictPort
```

Website: `http://127.0.0.1:5173/`, Konto: `http://127.0.0.1:5173/#/me/account`. Nach Änderung lokaler Vite-Umgebungsvariablen ist ein Serverneustart nötig. Zum Tagesabschluss ist keine Änderung dieser Variablen erforderlich.

```powershell
npm.cmd test
npm.cmd run check
npm.cmd run check:render
npm.cmd run build -- --configLoader native
npm.cmd run check:offline
node --check supabase/functions/platform/index.ts
git diff --check
```

Offline-Prüfung erst nach Build. Optional gebauten Stand lokal ansehen:

```powershell
npm.cmd run preview -- --configLoader native --port 4173 --strictPort
```

Die CLI-Hilfe bestätigt `--configLoader` auch für Preview. Kein neuer Preview-Server wurde für den Tagesabschluss gestartet. Sandbox-/Portrechte können eine gezielte lokale Ausführungsfreigabe erfordern. Keine globale Windows-Sicherheitsänderung als Ausweg vornehmen.

Cloud-Befehle und deren Voraussetzungen stehen in [SUPABASE-SETUP.md](SUPABASE-SETUP.md); sie sind **keine Startvoraussetzung für morgen** und dürfen nicht reflexartig erneut ausgeführt werden. Die gespeicherte Übergabe ersetzt weder GitHub-Sicherung noch ein Cloud-Backup. Beim nächsten Abschluss diesen Stand und die tatsächlich geprüften Ergebnisse aktualisieren.
