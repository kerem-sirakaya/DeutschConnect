# Gaming und vollständiges Self-Audit

Stand: 8. November 2026. Branch `codex-version-1.0`, HEAD `ff1c536`.

Dieser Bericht ergänzt die bestehende [Spieledokumentation](GAMES-LEADERBOARDS.md), den [Navigationsbericht](NAVIGATION-PROFILES-STATISTICS.md) und die [Schacheinladungen](CHESS-INVITATIONS.md). Alle fünf Arbeitsphasen wurden lokal durchgeführt: Bestandsprüfung, modulübergreifendes Audit, gezielte Korrekturen, erneute Prüfungen und Übergabe. Keine neuen Abhängigkeiten, Commits, Pushes, Deployments, Migrationen oder Änderungen an fremden Projekten. Bereits vorhandene uncommittete Arbeit wurde erhalten.

## Spiele und Ranglisten

| Spiel | Wertung | Geprüfte Grenzen |
| --- | --- | --- |
| Chess | Ein gültiger Sieg = ein Punkt; Niederlage/Remis separat | Eindeutige Partie-ID, Zugrekonstruktion, kein Sieg für laufende/abgebrochene Spiele; Hotseat getrennte Übung |
| Symbol Pairs | Eine vollständig gelöste Runde = ein Punkt | Sechs verschiedene Paare, korrektes Deck, stabile Runden-ID; Geschwindigkeit ohne Einfluss |
| Paper Flight | Höchster beendeter Einzeldurchgang | Keine Addition; Geschwindigkeit steigt sanft von 160 bis höchstens 260, räumlicher Hindernisabstand bleibt begrenzt; Neustart setzt Schwierigkeit zurück |
| Bridge Runner | Höchster beendeter Einzeldurchgang | Keine Addition; bestehende Sprung- und Hindernismechanik erhalten |

Die gemeinsame Komponente bietet bei jedem Spiel **Global / Meine Schule / Persönlich**, Spielauswahl, eigene Zeile und Historie. Gleichstände erhalten denselben Rang (1, 1, 3). Demo-Freigabe pro Spiel standardmäßig aus; Blockierungen werden berücksichtigt. Keine Kontaktdaten werden für Ranglisten übernommen.

Global und Schule funktionieren als **lokale Demo** mit freiwillig freigegebenen fiktiven Profilen und tatsächlich gespielten lokalen Ergebnissen. Für echte Konten sind diese Ansichten erreichbar, erklären aber die noch fehlende gemeinsame Ergebnisquelle. Persönliche Arcade-Ergebnisse sind nach Konto getrennt gerätelokal; persönliche Kontoschachpartien stammen aus der vorhandenen gefilterten Serversicht. Browserwerte sind keine verifizierten Online-Leistungen. Schulen beruhen bislang auf Selbstauskunft.

Speicherung: versionierter, profilbezogener Ergebnisspeicher, Web Locks, stabile IDs und idempotente Wiederholungen. Beschädigte Originale bleiben erhalten. Neu: Ein identischer Wiederholungsversuch aktualisiert auch die angezeigte Kopie eines veralteten Tabs. Bei ungespeicherten oder fehlgeschlagenen Ergebnissen fragt die interne Navigation vor dem Verlassen; Browser-Schließen erhält ebenfalls einen Warnhinweis. Bewusst bestätigtes Verlassen kann noch ungespeicherte Runden verlieren.

## 14 behobene Befunde

Die Nummern bezeichnen Ursachen, nicht die Zahl geänderter Zeilen. Die ersten sieben Probleme wurden zunächst mit fehlschlagenden Regressionstests reproduziert. Danach folgte eine zweite Prüfung von Identitätswechseln, Formularen, Gruppen und Wiederholungsversuchen.

| Nr. | Ursache und Auswirkung | Gezielte Korrektur / Nachweis |
| --- | --- | --- |
| A01 | Unbeteiligte Konten erhielten private Projektmitglied-IDs als anonymisierte Profilobjekte | Projektion referenziert private Mitglieder nur für berechtigte Beteiligte oder bei ausdrücklicher öffentlicher Projektfreigabe. Negativtest für fremde Konten. **Backend-Korrektur lokal, noch nicht bereitgestellt.** |
| A02 | Fremde Storage-Ereignisse unterbrachen Authentifizierung; Online-Ereignisse konnten einen laufenden Login verwerfen | Nur passende Sitzungsschlüssel synchronisieren; Generation nur bei tatsächlichem Wechsel ändern. Tests für fremde Schlüssel, laufenden Login und Tokenwechsel desselben Kontos. |
| A03 | Nach fehlgeschlagener Prüfung einer neuen Sitzung blieb die alte Kontoidentität sichtbar | Bei fehlgeschlagenem Sitzungswechsel alte Identität verwerfen; normale Netzfehler bei unveränderter Sitzung getrennt behandeln. |
| A04 | Bei gesperrtem Browserspeicher ging eine gültige Sitzung beim Wiederverbinden verloren | Fehlenden, unzugänglichen und erfolgreich beschriebenen Speicher unterscheiden; gültigen flüchtigen Sitzungsstand erhalten. |
| A05 | Identischer Spielspeicherversuch ließ die Anzeige eines veralteten Tabs unverändert | Neu gelesenen Stand auch bei idempotentem Erfolg veröffentlichen; feldweiser Ergebnisvergleich. |
| A06 | Ungültige Spielzustände konnten die Ergebnisberechnung zum Absturz bringen | Fehlende Szenen und nicht vorhandene Karten-/Paarlisten ohne Punkte zurückweisen. |
| A07 | Zugrekonstruktion akzeptierte Fortsetzungen nach automatischem Remis | Vor jedem weiteren Zug auf bereits beendetes Spiel prüfen; Regression mit fünffacher Stellungswiederholung. |
| A08 | Fehlgeschlagene Spielspeicherung warnte nur als Text, ohne interne Navigation abzusichern | Gemeinsamen Navigationsschutz für ausstehende Spielergebnisse ergänzen; Test des Schutzregisters. |
| A09 | Eventgruppen rekonstruierten Mitglieder aus der absichtlich eingeschränkten Teilnahmeansicht und verloren berechtigte Namen | Bei Konten die bereits serverseitig autorisierte Gruppenliste verwenden. Test mit drei Mitgliedern und unberechtigtem Außenstehenden. |
| A10 | Neue Konten ohne Schule konnten Projekt-/Nachhilfeformulare nicht sinnvoll abschließen; Projektdraft enthielt gegebenenfalls eine leere Schul-ID | Handlungsfähigen Hinweis auf Profileinstellungen anzeigen; leere Schul-IDs nicht an den Server senden. Drei Kontovarianten je Sprache gerendert. |
| A11 | Bestätigungslinks wurden kurzzeitig als Anwendungsroute inklusive Tokens in History-Metadaten übernommen; Bereinigung verlor den Zurück-Index | Auth-Hashes vor Routing auf Kontoseite abbilden; beim Entfernen der Tokens sichere History-Metadaten bewahren. Zwei Regressionen. |
| A12 | Nullable Formularfelder akzeptierten beim Wiederherstellen unerwartete Objekte | `null` ausdrücklich validieren; beschädigten Originaldraft erhalten. |
| A13 | Verzögert erfolgreiche Speicher-/Löschvorgänge konnten nach Seitenwechsel zurücknavigieren oder neu geöffnete Entwürfe löschen | Aktive Ansicht vor Weiterleitung/Draft-Löschung prüfen: Projekt-, Event-, Nachhilfe-, Profil- und Beitragsformulare sowie Schachlobby und Detail-Löschaktionen. Quellprüfung und Renderprüfung; interaktiver Verzögerungstest noch offen. |
| A14 | Wiederholung eines Beitrags nach verlorener Antwort erzeugte eine neue Nachrichten-ID | Stabile, im Tab gespeicherte Submission-ID verwenden; Backend akzeptiert identische Wiederholung derselben Nachricht, weist veränderte Daten unter gleicher ID zurück. Regression über simuliertes Neuladen. **Backend-Erweiterung lokal, noch nicht bereitgestellt.** |

## Prüfumfang der gesamten Anwendung

| Bereich | Durchgeführt | Grenze |
| --- | --- | --- |
| Navigation | 87 Routen für beide Demo-Profile in allen drei Sprachen; erzeugte Linkziele zusätzlich aufgelöst; History-Modelltests für Back/Forward, Abbruch und Ersetzen gespeicherter Formulare | Kein interaktiver Browserlauf |
| Registrierung/Login | Mock-HTTP-Tests für Bestätigung, abgelaufene Links, Identitätsprüfung, Refresh-/Kontowechsel, verzögerte Antworten, Logout und blockierten Speicher; konfigurierte und unkonfigurierte Oberfläche | Keine echten Benutzerkonten oder produktiven Auth-Daten getestet |
| Events | Servermodell für Freigabe, Anmeldung, Abmeldung, Anwesenheit/Auszeichnung und Rollen; Konto- und Demoansichten | Keine Live-Zwei-Konten-Abnahme |
| Projekte/Ideen | Eigentum, Revisionen, Anfrage gegenüber Mitgliedschaft, moderierter Abschluss, Gruppen und Sichtbarkeit; Erstellen/Bearbeiten/Detail in Renderprüfung | Keine reale Organisationsbestätigung erzeugt |
| Nachhilfe | Kombinierte Filter, eigene Angebote/Anfragen, Bearbeiten/Schließen/Löschen, private Kontaktentwürfe, neue Konten ohne Schule | Kontaktentwurf ist kein versandter Chat |
| Community/Gruppen/Nachrichten | Mitgliedschaft, private Gruppen, Blockierungen, Meldung, Moderationsgrenzen, Nachrichtenlimit, private Kontaktdaten, Wiederholung eines Beitrags und tatsächlicher Nachrichteninhalt im Renderlauf | Echte gemeinsame Unterhaltung hängt von Moderation/Backend ab |
| Personalisierung/Profile | Unterschiedliche Demo-Personas, Filter/Drafts, getrennte Statistiken, freiwillige Felder, negative Datenschutztests für fremde/gesperrte Konten und Altserver | Keine tatsächlichen Minderjährigendaten verwendet |
| Speicherung | Quoten-/Parse-/Versionsfehler, Rohdatenerhalt, Backups, Web Locks, konkurrierende Änderungen, revisionsgebundene Updates und getrennte Konten | Browserspeicher ist nicht manipulationssicher |
| Schach | Referenz-Perft, Rochade, en passant, Umwandlung, Matt/Patt/Remis, Zustimmung/Einladungen, Deduplizierung und Zugriffsschutz | Kein echtes Online-Match zwischen zwei Geräten |
| Arcade/Ranglisten | Kollisionen, Scoring, Schwierigkeit, erreichbare wechselnde Fluglücken bei Maximalgeschwindigkeit, alle Kategorien, Gleichstände, Speicherung und invalide Zustände | Modelltests ersetzen keine Touch-Abnahme |
| Responsive/Bedienung | Quellprüfung bestehender Breakpoints, skalierender Spielfelder, Umbruch und mindestens 44px großer Ranglistensteuerung; gemeinsame Bottom-Navigation erhalten | Browserinventar erneut abgefragt: Browserhost nicht verfügbar. Keine Screenshots, Klick-, Fokus- oder echten Smartphone-Tests behauptet |
| Sprachen | DE/TR/EN-Schlüssel, Textkodierung und tatsächlich gerenderte neue Konto-/Spieletexte | Keine unabhängige sprachliche Muttersprachlerabnahme |
| Backend | Edge-Function-/SQL-/RLS-Quellprüfung und reine Servermodelltests; kein Frontend-Service-Schlüssel; keine HTML-Ausführung von Beiträgen | SQL-/Deno-Integration nicht ausgeführt: entsprechende lokale Laufzeit/Instanz fehlt |

## Abschließende Prüfungen

- `npm.cmd test`: **132 erfolgreich, 0 fehlgeschlagen**. Darunter 14 Auditregressionen plus neuer History-Regression; vorhandene Modulprüfungen ebenfalls erfolgreich.
- `npm.cmd run check`: **796 Texte je Sprache**, identische Schlüssel und gültige Kodierung.
- `npm.cmd run check:render`: erfolgreich. Pro Sprache 87 Routen für Alex/Deniz, 103/95 erzeugte Linkziele, 19 Kontoansichten, 3 neue Kontoansichten ohne Schule, 8 Profil-/Beitrags-/Abschlussansichten, 3 Schachbretter, sämtliche 12 Spiel/Kategorie-Kombinationen jeweils als Demo/Konto sowie 12 Benachrichtigungsansichten. Weitere Bestätigungs-, Projekt- und Recovery-Zustände ebenfalls enthalten.
- `npm.cmd run build -- --configLoader native`: erfolgreich, 130 Module; JS 546,61 kB / gzip 168,25 kB. Bestehende nicht blockierende Warnung für Bundle über 500 kB; keine unnötige Architekturänderung dafür.
- `npm.cmd run check:offline`: gebaute fünf statische Ressourcen ohne Netz ausgeliefert; private/API-Anfragen vom Cache ausgeschlossen. Kein realer Handy-Flugmodustest.
- `node --check supabase/functions/platform/index.ts`: Syntaxprüfung erfolgreich; kein Deno-/SQL-Integrationstest.
- `git -c core.safecrlf=false diff --check`: nach Entfernung einer zusätzlichen EOF-Leerzeile erfolgreich.

## Dateien dieses Audits

- Auth/Routing: `src/services/supabase.js`, `src/state/AccountContext.jsx`, `src/data/navigation.js`, `src/state/routeHistory.js`, `src/App.jsx`.
- Speicherung: `src/state/pageMemory.js`, `src/state/usePageMemory.js`, neu `src/state/navigationGuard.js` und `src/state/useActiveView.js`.
- Spiele: `src/games/leaderboards.js`, `resultRepository.js`, `GameResultsContext.jsx`, `ChessLobby.jsx`, `supabase/functions/_shared/chess.js`.
- Module: neu `src/data/groups.js`, `src/components/ProfileSchoolNotice.jsx`; `src/pages/Community.jsx`, `PersonalSettings.jsx`, `IdeaSubmit.jsx`, `IdeaDetails.jsx`, `EventNew.jsx`, `TutoringNew.jsx`, `TutoringDetails.jsx`; `src/locales/quality/{de,tr,en}.json`.
- Serverprojektion/Beiträge: `supabase/functions/_shared/platform.js`.
- Prüfungen: neu `scripts/audit.test.mjs`; `scripts/route-history.test.mjs`, `scripts/check-render.mjs` erweitert.
- Dokumentation: dieser Bericht, `SESSION_HANDOFF.md`, `GAMES-LEADERBOARDS.md`, `README.md`.

## Externe Voraussetzungen und nächste Sitzung

Die ignorierte `.env.local` ist vorhanden; die bestehende Konfigurationsprüfung erkennt gültige öffentliche Frontend-Konfiguration. Nur Status/Variablennamen geprüft, keine Werte ausgegeben. Cloud-Tabellen, laufende Function-Version und tatsächliche Berechtigungen wurden in diesem Auftrag **nicht live geprüft oder geändert**. Frühere Angaben zum eingerichteten eigenen Projekt sind historische Nachweise der Übergabe.

1. Lokalen Stand sichern/reviewen; keine automatischen Commits. Danach interaktiver Desktop-/Smartphone-Test mit Verzögerungen, Speicherfehlern, Browser-Zurück und Touch-Eingaben.
2. Die lokal vorbereitete `platform`-Function einschließlich Profilprojektion, privater Lesemarkierungen, A01 und A14 vor externer Bereitstellung gemeinsam prüfen. Keine SQL-Migration für diese Korrekturen erstellt. Bis zur genehmigten Bereitstellung ist A01 im laufenden Altbackend nicht behoben.
3. Zwei kontrollierte Testkonten verwenden und Projekt-/Gruppen-/Schacheinladungsablauf über zwei Browser und später zwei Geräte abnehmen; keine produktiven Schülerkonten.
4. Gemeinsame Ranglisten innerhalb der vorhandenen Backend-Schnittstelle planen: freiwillige Teilnahme, pseudonyme Ausgabe, bestätigte Schulzugehörigkeit, servergeprüfte Runden, atomare Deduplizierung und Rate Limits. Lokale Arcade-Scores nicht ungeprüft hochladen.
5. E-Mail-Einladung bleibt vorbereitet: Anbieter/Absender, Geheimnisse ausschließlich serverseitig, Ereignis-Queue, Opt-in, Zustellung/Wiederholungen und sichere App-URL fehlen. Der Nutzer wählte ausdrücklich zunächst Website-Benachrichtigungen. Ohne geöffnete Website gibt es derzeit keine externe Einladungshinweise; bei späterem Öffnen erscheint die gespeicherte Einladung.
6. Nach Funktionsabnahme gegebenenfalls Bundle durch gezieltes Lazy Loading verkleinern. Das ist eine Optimierung, kein Grund, Features zu entfernen.

Git-Status: Bereits vor dem Audit zahlreiche modifizierte/unversionierte Dateien aus Navigation, Profilen, Bestenlisten und Einladungen. Diese bleiben erhalten; Auditänderungen ebenfalls uncommittet. HEAD unverändert, keine Branchwechsel oder Cloud-Operationen. Der Bericht ist eine nachvollziehbare lokale Qualitätsprüfung, keine Zusicherung, dass die gesamte Anwendung fehlerfrei oder produktionsreif ist.
