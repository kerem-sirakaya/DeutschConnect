# Überprüfter Versionsvergleich und Übergabe

Stand 8. November 2026. [Blueprint](../CODEX_INTEGRATION_BLUEPRINT.md), [Codex-API und Modelle](API_AND_DATA_MODELS.md), [Manifest](CODEX_INTEGRATION_MANIFEST.json).

## Nachweisgrenze

**Tatsächlich lesend geprüft:** lokale Referenz `origin/claude-version-1.0` am Commit `9121665b98eef74ede9f3792b852180502eb8e0d`, ohne Fetch, Checkout oder Änderungen an dieser Version. `git ls-tree` belegt die Dateiliste. Gelesene konkrete Quellen: package/Lock, main/App, AuthContext, AppStateContext, Supabaseclient, Event-/Ideen-API, SQL 001/004/005 und gezielte Funktions-/Status-/Prüfstellen aus 006, Designvariablen sowie docs/HANDOFF.md. Das ist **keine vollständige Sicherheitsprüfung der Claude-Version**, kein Nachweis ihres aktuellen lokalen Arbeitsbaums und kein Zugriff auf Eges Supabase-Projekt. Seine HANDOFF-Liveangaben bleiben Teamangaben, hier nicht verifiziert.

Quellnotation `E:pfad` bedeutet `git show origin/claude-version-1.0:pfad`; sie bezeichnet keinen Codex-Pfad gleichen Namens. Alte Dokumente mit „Claude unbekannt“ bleiben historische Übergaben; diese Datei ergänzt erstmals den begrenzten überprüften Vergleich.

## 1. Verifizierte Strukturunterschiede

| Aspekt | Codex-Arbeitsbaum | CLAUDE REF / konkrete Quelle | Integrationsfolge |
| --- | --- | --- | --- |
| Einstieg | captureAuthCallback→Language→Account→Demo→App | E:src/main.jsx: BrowserRouter→Language→Auth→AppState→App | Eine Shell, ein Router, ein Callback-Consumer |
| Routing | `#/…`, eigene history-Metadaten/Guards | E:src/App.jsx und main: BrowserRouter, Routes/Route | Alte Hashlinks, neue Pfade und direkte Reloads testen |
| Auth | Raw REST, eigene Kandidatenprüfung/Kontowahl | E:src/auth/AuthContext.jsx, lib/supabaseClient.js: SDK getSession/onAuthStateChange/signUp/signInWithPassword | Keinen zweiten Tokenstore/Refreshzyklus einbauen; expliziten Kontowahlfall in Zielauth prüfen |
| Profilanlage | Bei erster platform-Anfrage, displayName/language, Schule initial leer | E:SQL001 handle_new_user nach auth.users-Insert; first_name/school_id/grade aus Metadaten | **Einfacher Wechsel der Supabase-URL kann Registrierung brechen**, weil school_id im Claude-Trigger Pflicht ist |
| Profildaten | JSON Profile mit Freigaben/customInterests | E:AuthContext/fetchProfile: first_name,grade,school_id,avatar_color,interests + Schule | Extra Freigaben/öffentliche Read Models fehlen im gelesenen Claude-Modell |
| Schule | Änderbare Selbstauskunft | E:SQL001: nach Anlage nicht durch normale Nutzer änderbar; bei Signup ausgewählt | Unveränderlichkeit beweist noch keine institutionell bestätigte Schulzugehörigkeit |
| Speicherung | Geschützter Workspace, Commands/CAS, Function | E:lib/eventsApi.js / ideasApi.js: direkte RLS-Tabellen/RPC | Eine führende Schreibautorität je Entität, kein blindes Doppelpersistieren |
| Events | Schülerproposal, Moderator bestätigt, owner/attendance im JSON | E:SQL001/006: relationale Events, Admin-RPCs, Kapazität/Zeit-/Statusregeln | ownership und Belege in Zielmodell erhalten/erweitern, nicht aus status=completed erfinden |
| Ideen | Planung/Lifecycle/Mitgliedschaft/Completion, keine Freigabe | E:ideasApi und SQL004: submitted privat, collecting/review/planned freigegeben; idea_supports | Unterstützung ist weder Antrag noch Mitgliedschaft oder Abschluss |
| Projekte | Im Idea-Datensatz mit Gruppen-/Abschlussbezug | E:src/data/projects.js und network/projects/:id: eigene statische Demo-Projekte | Kein Nachweis echter Projektmitgliedschaftstabellen im geprüften Ref |
| Moderation | Globale Function-Allowlist und bestehende kleine Moderatorseite | E:SQL005 admins/is_admin; SQL006 admin_* RPCs; E:App keine /admin-Route | SQL-Adminbasis ist vorhanden; ein erweitertes Adminfrontend ist im gelesenen Ref noch nicht vorhanden |
| Zusätzliche Module | Nachhilfe, Schülerprofile, Gruppenbeiträge, Schach/Arcade/Notifications | Keine entsprechenden Routen/Dateien im geprüften E-Tree | Codexfunktionen explizit portieren, nicht als entbehrliche Duplikate löschen |
| i18n | Fünf JSON-Schichten je Sprache, accountCopy | E:src/i18n + ein locales-JSON pro Sprache, localize für mehrsprachige Daten | Key-/Textmodell und Nutzerdaten-Mehrsprachigkeit getrennt mappen |
| CSS | global/modules/games, --blue/--surface | E:styles variables/base/layout/components/pages, --color-primary etc. | Gemeinsame Tokens, keine zwei globalen Reset-/Buttondefinitionen |
| Pakete | React ^19.2, Vite ^7.2, Plugin ^5.1, Playwright | E:package.json: React ^19.1, Vite ^6.3.5, Plugin ^4.5, Router ^7.6, SDK ^2.119 | Ein Lockfile kontrolliert neu erzeugen, nicht Zeilen beider Locks zusammenkleben |
| Tests | 147 Node + 52 lokale Playwright + Render/Locale/Offline | E:tests/ sechs Node-Testdateien, SQL-Testpläne; HANDOFF nennt 44 Tests | Claude-Zahl nur dokumentiert, nicht hier ausgeführt; Zieltests gemeinsam prüfen |

## 2. Konkrete Mapping-Tabelle, noch keine Migration

| Codex | Claude REF | Sichere Entscheidung vor Übertragung |
| --- | --- | --- |
| profiles[id].displayName | profiles.first_name | Pseudonym-/Namenssemantik abstimmen; keinen Nachnamen ergänzen; Länge min2 vs min1 |
| schoolId / interests / customInterests / language / profileSharing | school_id / interests; grade/avatar_color zusätzlich, keine identischen Sharingfelder | Gemeinsames Profilmodell, Felder ohne Gegenstück nicht verwerfen oder öffentlich machen |
| `local-…`-Objekt-ID | UUID für Event/Idee | Opake Mappingtabelle oldNamespace+oldId→newId oder vereinbarter Text-ID-Vertrag; sämtliche Referenzen/Links gemeinsam anpassen |
| Auth-UUID | Auth-UUID in anderem Projekt | Gleiche Zeichenform ≠ gleiche Identitätsquelle. Kein Merge per Anzeigename; kontrollierte Kontozuordnung/Neuanmeldung nur nach Entscheidung |
| ideas.title 5–90 / description 20–1000 / topics bis8 / category | title 5–80 / description 20–600 / topics1–3 / format+school_ids | Keine stille Trunkierung. Konflikte als Datensatzbericht zur Review vorlegen; Kategorie≠format |
| projectStatus proposal/looking/preparing | idea.status submitted/collecting/review/planned/rejected(006) | Planung und Veröffentlichung sind verschiedene Achsen; eigene Zielspalten/Adapterentscheidung |
| requestedIds / participantIds / interestedIds | idea_supports | Unterstützungen höchstens Interessen nach bewusster Semantikentscheidung; nie daraus Mitgliedschaft/Leistung ableiten |
| completion.confirmedBy/At/memberIds | Kein entsprechender Beleg im gelesenen Schema | Neue kompatible Belegstruktur oder erhaltene sichere Quelle; keine geplanten Projekte als abgeschlossen zählen |
| activities.startsAt / approval / cancelled | events.start_at / status / capacity | proposal→draft nur als vorgeschlagene Veröffentlichungssicht; confirmed bleibt zulässiger Status, cancelled und completed mit eigenem Vertrag |
| Event.ownerId | Kein entsprechendes owner-Feld in E:SQL001-Events | Schülerorganisation/Verwaltungsrechte benötigen Modellentscheidung, nicht durch globales Adminrecht ersetzen |
| participation joined/interested/null | registrations registered/interested/Zeile entfernen | joined→registered, interested→interested; Null→Delete; organisiert aus owner. Attendance getrennt |
| attendance[profileId] / awards | Keine entsprechenden Tabellen im gelesenen Ref | Nur echte Nachweise übertragen; Admincompleted eines Events reicht nicht |
| modules.tutoring/groups/messages/challenges/games | Keine passenden Tabellen im geprüften Ref | Erweiterung separat planen, Rechte/Indizes/Constraints/Backfill/Rollback prüfen |
| reports / blocks | admins-Rolle ist kein Report-/Blocksystem | Meldung, persönliche Sperre und globale Kontosperre getrennt definieren |
| notifications aus Challenges / chessRead | Kein entsprechendes gelesene Modell | Einladungsstatus bleibt führend; keine zweite manuelle Kopie/ungelesen-Zähler |
| game-results pro Browser/Konto | Kein Serverresultat-Vertrag | Lokale Werte lokal lassen; Migration nicht als Verifikation verkaufen |
| localStorage deutschconnect.demo.v1 + account-Hostsession | deutschconnect.demoState / deutschconnect.accountState.v1.<id> + SDK-Sitzung | Keine Namensumbenennung als Migration; Demo behalten, reguläre Neuanmeldung statt ungeprüftem Tokenimport |

## 3. Claude-Migrationsblocker 004/006

**CODE bestätigt:** E:supabase/migrations/004_ideas_moderation.sql verwendet `status <> 'submitted'` für Lesen/Zählung und keine ausdrückliche Veröffentlichungs-Allowlist im Support-Exists. E:006 erwartet in seiner Selbstprüfung dagegen den strengeren v3-Vertrag mit Allowlist und passendem `get_idea_support_counts`. HANDOFF benennt diese Abweichung ebenfalls. 006 fügt rejected/draft, Admin-RPCs und einen READ-COMMITTED-/Kapazitätsguard hinzu.

Folge: Die Repositoryfolge ist nicht ohne Weiteres reproduzierbar als geprüfte frische Installation von 001 bis 006. Nicht pauschal alle SQL-Dateien beider Branches ausführen. Eine unerwartete Liveabweichung soll nach 006-Selbstprüfung die Transaktion abbrechen; das ist keine Freigabe zum Ausprobieren im Schulprojekt. Vor Integration v3-Quelle/angewendete Definitionen abgleichen, auf isolierter Kopie installieren, negative Sichtbarkeit von submitted/rejected und gleichzeitige Platzvergabe testen. Dieser Auftrag hat kein SQL ausgeführt und keinen Livezustand von Eges Projekt geprüft.

## 4. Risikobewertung

Wahrscheinlichkeit = Einschätzung für einen unvorbereiteten Merge, kein gemessener Wert. **Bestätigt** betrifft den Strukturunterschied, nicht einen bereits eingetretenen Datenverlust. Aufwand S/M/L ist relativ, keine verbindliche Stundenprognose.

| # Risiko | Wahrscheinlichkeit / Beleg | Auswirkung | Behebung | Gegenmaßnahme |
| --- | --- | --- | --- | --- |
| 1 Doppelte Komponenten | Hoch, gleichnamige Cards/Shells bestätigt | Falsche Props, verlorene Funktionen | M | Pro Funktion führende Komponente und Read Model wählen |
| 2 Zwei Router | Hoch, bestätigt | Kaputte Deep Links/Back/Authcallback | M | Ein Router, Legacy-Alias/Redirectmatrix, Guardtests |
| 3 Zwei State Provider | Hoch, bestätigt | Unterschiedliche aktive Nutzer/Daten | L | Ein Authzustand, expliziter Demo-/Accountadapter |
| 4 Datenmodelle | Hoch, bestätigt | Stille Trunkierung/Statusfehler | L | Explizites Mapping, Konfliktliste und Schema-/Adaptertests |
| 5 Benutzeridentitäten | Hoch, getrennte Architekturen; tatsächliche Konten nicht verglichen | Fremdes Eigentum/Datenschutzverletzung | L | Führendes Authprojekt, kontrollierte ID-Zuordnung |
| 6 Doppelte Auth | Hoch, REST/SDK bestätigt | Sessionwechsel/Callbackrennen/Refreshfehler | L | Ein Client; Authregressionen inkl. A/B-Kontowahl übernehmen |
| 7 Mehrere Supabaseprojekte | Hoch, Projektwahl offen | Schreiben in falschen Bestand | L | Ziel explizit, Staging isolieren, keine Env-Kopie zwischen Projekten |
| 8 Rollen/Admin | Hoch, Allowlist vs admins bestätigt | Privilegienausweitung/fehlende Moderation | L | Ein Rollenmodell, serverseitige Fähigkeiten, Entzug/Audit testen |
| 9 Profile/Datenschutz | Hoch, unterschiedliche Felder bestätigt | Private Interessen/Aktivitäten öffentlich | L | Sharing default false, getrennte öffentliche Projektion |
| 10 Statussemantik | Hoch, bestätigt | Support als Mitglied/Leistung, proposal veröffentlicht | L | Getrennte Veröffentlichungs-/Planungs-/Abschlussachsen |
| 11 Nachrichten/Notifications | Hoch bei ungezielter Portierung | Falsche Empfänger/doppelte Hinweise | L | Kontextrechte, Recipientvertrag, idempotente Ereignisse |
| 12 Globale CSS | Hoch, beide globale Styles bestätigt | Unbedienbare/inkonsistente mobile UI | M | Tokens und Namespace zuerst, Screenshots/Touch prüfen |
| 13 Pakete/Lockfile | Hoch, Vite/Plugin/Router/SDK anders | Build/Peer-Abhängigkeiten brechen | M | Gewählte Versionen, ein Lockfile, npm ci+Build |
| 14 Dev-/Buildkonfiguration | Hoch, unterschiedliche Vitescripts | Portabweichung/Redirectfehler | S/M | Explizite Ports/Node, getrennte Testkonfiguration |
| 15 Hosting | Hoch solange lokal | 404 bei BrowserRouter, fremde Gerätelinks tot | M | HTTPS-Adresse, Rewrite/Origins/Callback zusammen testen |
| 16 Migration/Datenverlust | Hoch ohne Plan; 004/006-Drift bestätigt | Datenverlust/inkompatibler Rollback | L | Sicherung, Kopie, Backfillreport, Schreibstopp, Cutover/Rückfall |
| 17 Sicherheit/Datenschutz | Hoch, DC-I01 bestätigt, weitere Risiken nicht pen-getestet | Offenlegung Minderjährigendaten | L | Publicationfix, negative API-/Rollen-/Freigabetests vor Beta |
| 18 Spiel-/Leaderboardzustand | Hoch, nur Codexspiele im Ref | Verlorene Partien/ungeprüfte Scores global | M/L | Serverpartien und lokale Runs getrennt, keine erfundenen Ränge |

## 5. Admin-Abgleich

Die Codex-Aktionen aus [API-Referenz](API_AND_DATA_MODELS.md) sind **kein** Synonym für Claude `admin_*` RPCs. Vor einer Verbindung folgendes festlegen:

| Fachaufgabe | Codex-Ist | Claude REF / offener gemeinsamer Vertrag |
| --- | --- | --- |
| Projekt-/Ideenmoderation | Keine allgemeine Freigabe; confirmProjectCompletion nur Abschluss | admin_set_idea_status in 006; Veröffentlichung von Planung/Mitgliedschaft/Completion trennen |
| Eventverwaltung | Schülerproposal, approveEvent; keine Datum-/Absage-/Kapazitätsverwaltung | admin_list/create/update/set_status/delete_event in 006; ownerrechte, begrenzte Löschung und Registrierungsfolgen klären |
| Teilnahmebeleg/Award | Moderator bestätigt tatsächliche angemeldete Anwesenheit; zwei angegebene Schulen | Keine entsprechenden Belegtabellen im gelesenen Ref; Evidenz/Widerruf/Statistiken erweitern |
| Reports/Inhaltsentfernung | report/resolveReport/moderateMessage, globaler Moderator liest Gruppen | Admin-RPCs für diese Objekte nicht im gelesenen 006; Zielfelder, Bearbeitungsrechte, Audit nötig |
| Blocks/Kontosperren | Persönliche beidseitige Sicht-/Spielsperre | Nicht mit admins oder globaler Schulsperre verwechseln |
| Rollen | Function-Allowlist, global | admins-Tabelle und is_admin; keine automatische Rollenzusammenlegung |
| Nutzer-/Schulverwaltung | Statischer Katalog, Schulselbstauskunft | HANDOFF plant admin_list_users/dashboard_stats/Schulverwaltung, keine behaupteten fertigen Funktionen |
| Statistik | Abgeleitet aus echten belegten Statusinformationen | Nach Löschung/Absage/Widerruf gemeinsam neu berechnen; keine unabhängig schreibbaren Erfolgszähler |

Jede neue Adminmutation braucht: Actor aus servergeprüfter Identität, Ziel-ID/Typ, erlaubten Übergang, erforderlichen Vergleichsstand, Rollen-/Schulscope, Zeit/Begründung/Audit, API-Fehlercodes in DE/TR/EN, Nutzer-/Gruppen-/Notificationfolgen und positive/negative Tests. Heutige optionale expectedRecord-Prüfung und fehlendes Adminaudit genügen nicht als fertiger gemeinsamer Adminvertrag.

## Integrationsplan mit Abnahmekriterien

**Künftige Arbeit, hier nicht ausgeführt.** Jede Zeile benennt Voraussetzungen, Aktion/Abhängigkeit, Risiko, Erfolg und Rückfall.

| Stufe | Voraussetzung | Konkrete Aktion / Abhängigkeit | Risiko | Erfolgskriterium | Rückfall |
| --- | --- | --- | --- | --- | --- |
| 1 Sichern | Beide aktuellen Arbeitsbäume verfügbar | Owner reviewt/sichert Commits oder private Arbeitskopien inkl. uncommitteter Dateien, ohne Secrets; Inventar vergleichen | HEAD enthält neuesten Code nicht | Beide reproduzierbare Snapshots mit Hash/Lock/Status | Originale unverändert lassen |
| 2 Vergleichen | Stufe1 | Matrix beider aktuellen Versionen nebeneinander; Live/Mock/Plan markieren | Unbemerkter Funktionsverlust | Pflichtfunktionen und Lücken von beiden bestätigt | Noch keine Codeübernahme |
| 3 Architektur entscheiden | Beide Inventare/Statusmodelle | ADRs für A/B/C, Router, Provider, Theme/i18n, führendes Backend; abhängig von aktuellen Claude-Änderungen | Falsche Grundlage | Ein Zielvertrag pro Zuständigkeit | Optionen weiter read-only halten |
| 4 Identitäten/Modelle | Zielbackend und Freigabe des Konzepts | UUID-/Objektmapping, Feld-/Statusmapping, Rollen/Schulscope, Migrations-/Backfill-/Rollbackentwurf | Fremdes Eigentum/Trunkierung | Fiktive Daten verlustfrei mappbar, Beziehungen/Sharing nachgewiesen | Quelle read-only behalten, keine Live-Migration |
| 5 Auth integrieren | Stufe4, Callbackadresse entschieden | Einen Authclient/Profilebootstrap; A/B/Kontowahl/fehlende Profile/Expiry/Reload testen | Sessionmix und Signuptrigger-Konflikt | Zwei getrennte bestätigte Testidentitäten mit korrektem Profil im Ziel | Bisherige Version isoliert weiter nutzbar |
| 6 Kernmodule übernehmen | Auth/Adapter stabil | Zuerst ein Projekt-/Antrag-/Reviewablauf, dann Eventvorschlag/Freigabe/Anmeldung/Beleg; danach Nachhilfe/Gruppen/Spiele | Zustände semantisch vermischt | Fachliche und negative Rechte pro vertikalem Ablauf grün | Modulweise zurücknehmen, keine Dual Writes |
| 7 Rechte/Notifications | Gemeinsames Rollen-/Objektmodell | Publicationfix, Profile/Blocks, Reports/Adminaudit, Challengeereignisse/Lesemarken, Belegwiderruf vereinheitlichen | Private Daten/ungeprüfte Leistungen | Roh-API liefert ausschließlich erlaubte Sicht, Widerruf wirkt vollständig | Betroffene Fähigkeit sperren, alte Daten erhalten |
| 8 Regression | Stufen5–7, fiktive integrierte Fixtures | Beide Testsuiten und zusätzliche Risiko-/Mappingtests gegen denselben Zieladapter; SQL auf Kopie | Simulator kaschiert echten DBfehler | Unit/HTTP/SSR/Browser plus echte SQL-Rechte/Parallelität auf Kopie grün | Keine Stagingfreigabe |
| 9 Staging | Genehmigte Umgebung, Backup/Restore, HTTPS | Eigene Env-/Auth-/Origin-/SMTP-/Routingkonfiguration; eingeschränkter Zugriff, freigegebenes Deployment | Falsches Projekt/öffentlich private Testdaten | Von beiden Geräten erreichbar, Callback/Rewrite korrekt, Secrets serverseitig | Voriges Artefakt+passendes Schema, Staging stoppen |
| 10 Zwei Nutzer | Zwei dedizierte bestätigte Testkonten und Staging | Vollständiger A/B/C-Ablauf mit neuem Browser/Handy, Offline/Reconnect/Reload/Role revoke | Lücken erst unter echten Tokens sichtbar | Gespeicherte Daten/Empfänger/Isolation und Belege nachvollziehbar | Keine Beta, sichere Diagnosen sammeln |
| 11 Fehler schließen | Befundliste aus Stufe10 | Ursachen reproduzieren, klein beheben, betroffene Tests wiederholen, Go/No-go-Protokoll | Nur UI versteckt Fehler | Keine offenen P0/P1-Rechte-/Auth-/Datenverlustbefunde | Staging auf kompatiblen Stand zurück |
| 12 Begrenzte Beta | Ownerfreigabe, Betrieb/Moderation/Datenschutz klar | Release-/Rollbackverantwortung, kleine Teilnehmergruppe, bereinigte Fehlerüberwachung, Supportweg | Unbetreute öffentliche Plattform | Kernabläufe stabil und klare Rückmeldungen | Anmeldung/gefährdete Fähigkeiten kontrolliert sperren, Daten erhalten |

## Vergleichs- und Übergabeanleitung für Claude

1. **Zuerst lesen:** Blueprint §§1–6/20/25–33, Manifest, API-/Datenanhang; danach Komponentenmatrix, diesen Vergleich und die Authkorrektur. Für Fachdetails Admin-Istvertrag heranziehen. Inventar ist der Quellnachweis, keine Ausführungsanweisung.
2. Einen gleich strukturierten Bericht **des aktuellen Claude-Arbeitsbaums** erzeugen: Commit+uncommittierte Dateien, echte Module/Commands/RLS/RPC, angewendete Migrationsfolge, Auth-/Router-/Profilverträge, Testbelege und offene Punkte. Keine Env-Inhalte oder echten Schülerdatensätze exportieren.
3. Manifestfelder nach Funktion/Modell vergleichen, nicht nur Dateinamen. Jede Zeile als gleich, abweichend, fehlt, ungeprüft oder ersetzt klassifizieren. Für Abweichungen ADR+konkreten Mapping-/Testfall anlegen.
4. Reine Schach-/Arcade-/Ranking-/Matchingregeln und UI-Primitives sind wahrscheinliche Übernahmekandidaten; Account-/DemoProvider, Router, JSONB-API, Gruppen-/Freigabeprojektion brauchen zuerst Entscheidungen.
5. Höchste Risiken zuerst: Publication-/Privatsicht, Authprojekt/Identität, 004/006-Reproduzierbarkeit, Rolle/Scope, Statussemantik. Theme und Animation kommen danach.
6. **Integrationbranch erst später vorbereiten:** beide gesicherten Versionen auf bekannten Hashes, sauberen Zielcheckout aus der ausdrücklich gewählten Basis erstellen, nur vereinbarte Module in kleinen reviewbaren Schritten übernehmen. Nicht jetzt automatisch `git merge` ausführen und nicht den aktuellen schmutzigen Codex-Worktree wechseln. Neueste uncommittete Dateien müssen vorher gesichert sein.

### Fragen, die Claude/Ege beantworten muss

1. Welcher Commit und welche uncommitteten Änderungen repräsentieren eure aktuelle Version?
2. Sind die gelesenen HANDOFF-Aussagen zu 004v3/005/006 weiterhin aktuell? Welche Definition ist auf Kopie/live tatsächlich aktiv?
3. Existiert inzwischen `/admin` samt serverseitigen Rechten? Welche Rollen, Schulscopes, Entzugs-/Auditregeln?
4. Welches Supabase-Projekt soll führend sein und wie werden bestehende Test-/Pilotkonten zugeordnet? Keine Schlüssel/Passwörter senden.
5. Welcher Router/Callbackpfad/Hostingbase gilt? Werden alte `#/…`-Einladungs-/Profil-/Partielinks weiter unterstützt?
6. Sind Anzeigenamen/Pseudonyme, freiwillige Einzel-Feldfreigaben und Projektaktivität bereits modelliert?
7. Wie werden unterstützte Ideen, Anträge, angenommene Mitgliedschaft und echte Projektabschlüsse getrennt?
8. Wer darf Events vorschlagen/ändern/absagen; wie gelten Zukunft, Kapazität, Teilnehmerbeleg, Belegwiderruf und Auszeichnung?
9. Welche Gruppen-/Nachrichten-/Report-/Blockmodelle existieren inzwischen und wer darf private Räume moderieren?
10. Wie sollen Nachhilfeanfragen wirklich zugestellt und beantwortet werden? Privater Entwurf genügt dafür nicht.
11. Welche Regeln und Datenquelle gelten für persönliche und öffentliche Spielergebnisse/Opt-ins/Schulprüfung?
12. Welche Texte/Designkomponenten sollen führen und wie werden unbekannte Status-/API-Fehler übersetzt?
13. Welche SQL-/Mehrnutzer-/Geräte-/Mailtests sind tatsächlich durchgeführt, mit welcher Umgebung und welchem Commit?
14. Welche Backup-/Restore-/Release-/Rollbackverantwortung und welche beschränkte Betagruppe sind vorgesehen?

### Kurzauftrag an das andere KI-System

> Analysiere zuerst deinen aktuellen Claude-Code und bestätige oder korrigiere die markierten CLAUDE-REF-Befunde. Codex liefert 42 Commands, Hashnavigation, einen privaten JSONB-Workspace und zusätzliche Profil-/Nachhilfe-/Community-/Spielmodule. Die neuesten Auth-/UX-Korrekturen liegen teilweise uncommittet vor. Erhalte diese Funktionen und ihre Rechte-/Statistikregeln. Erstelle zunächst Mapping/ADRs und eine gemeinsame Testmatrix. Führe keinen Merge, keine Migration, keinen Projektwechsel und kein Deployment aus, bevor Zielarchitektur, Datensicherung und konkrete Freigaben feststehen. Lokale Tests sind kein Livebeweis; DC-I01 und der Redirect-Geräteblocker sind vor einer Beta zu schließen.
