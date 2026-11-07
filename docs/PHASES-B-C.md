# Personalisierung und Interaktion: Phase A und weiterer Plan

Aktuelle Übergabe vom 8. November: [SESSION_HANDOFF.md](SESSION_HANDOFF.md). Backend und grundlegender Live-Auth-Ablauf sind inzwischen eingerichtet beziehungsweise bestätigt; die nachfolgenden offenen Punkte sind als historischer Plan zu lesen, nicht ungeprüft erneut umzusetzen.

**Historischer Planungsstand:** Auf einen anschließenden ausdrücklichen Auftrag wurden Backend und Spiele inzwischen implementiert. Das zweite Team wird dabei nicht vorausgesetzt. Der aktuelle Umsetzungs- und Verbindungsstand steht in [SUPABASE-SETUP.md](SUPABASE-SETUP.md); die nachfolgenden Planungstabellen dokumentieren den früheren Architekturauftrag.

Stand: 7. November 2026. Phase A ist in der bestehenden React/Vite-Anwendung umgesetzt. Die folgenden Backend-, Echtzeit- und Spieleabschnitte sind **Planung**, keine implementierten Dienste. Es wurden keine Supabase-Tabellen, Konten, echten Nachrichten, Schachpartien oder Offline-Caches angelegt.

## Bestandsaufnahme und Phase A

Vorgefunden: zwei fiktive Demo-Profile, interessenabhängige Empfehlungen, lokale Eventanmeldung und Rücknahme, Projektanlage/Bearbeitung, Nachhilfe-Börse, Vormerkungen, Kontaktentwürfe und lokale Diskussionsräume. Dazu kamen bereits datensatzweise Wiederherstellung, Sicherungen, Mehrtab-Sperren, Entwurfsschutz und drei Oberflächensprachen. Es gab keinen Supabase-Client, keine Authentifizierung, gemeinsame Datenbank, echten Gruppen, Spiele oder Auszeichnungen.

„Mein Bereich“ besitzt jetzt die Unterseiten Übersicht, Aktivitäten, Projekte, Nachhilfe, Vormerkungen, Community und Profil/Einstellungen. Die frühere Profileingabe wird als `PersonalSettings.jsx` weiterverwendet. Die fünf Hauptnavigationseinträge bleiben unverändert. `/me/account` erklärt den tatsächlichen Gaststatus und die fehlende Kontoanbindung; es gibt kein nachgebautes Loginformular, das eine Anmeldung vortäuscht.

`selectPersonalArea` in `src/data/personalArea.js` erzeugt persönliche Listen und Zahlen aus dem aktuellen Zustand. Anmeldungen, Interesse, eigene Projekte, aktive Demo-Mitgliedschaften, offene Projektanfragen, offene Nachhilfeangebote/-gesuche und Vormerkungen werden getrennt gezählt. Geschlossene Nachhilfe bleibt verwaltbar, zählt aber nicht als offen. Entfernte Inhalte zählen nicht. Vernetzungsinteresse an Personen zählt nicht als gespeicherte Aktivität. Bereits vergangene Demo-Termine erscheinen getrennt; sie erzeugen keinen Anwesenheitsnachweis.

Bei Projekten gilt nun: Interesse → optional Anfrage → Annahme oder Ablehnung durch das Eigentümer-Demo-Profil. Interesse und Anfrage gewähren keine Mitgliedschaft. Antragsteller können Anfragen zurücknehmen und Demo-Mitgliedschaften beenden. Bestehende `participantIds` bleiben als **lokale Demo-Mitgliedschaften** erhalten. Neue Felder `interestedIds` und `requestedIds` werden additiv gespeichert und einzeln validiert. Die ältere Aktion `toggleIdea` bleibt für den vorhandenen Daten-/Testvertrag erhalten; die Oberfläche verwendet den neuen Anfrageablauf. Keine dieser Aktionen ist eine serverseitige Berechtigung oder tatsächliche Zustellung.

Der Eventablauf lautet: Detail öffnen → „Anmeldung ausprobieren“ → erst nach erfolgreichem lokalen Speichern Rückmeldung → Link zu „Mein Bereich → Aktivitäten“. Die v1-Schlüssel bleiben kompatibel: `interested` ist Vormerkung, `joined` lokale Demo-Anmeldung, `organized` lokale Organisationsauswahl. Keiner dieser Werte bestätigt eine durchgeführte Teilnahme.

`src/data/access.js` beschreibt die aktuellen Fähigkeiten ausdrücklich als `mode: guest`, ohne Auth-Subject, Synchronisierung oder bestätigte Anwesenheitsdaten. `DemoContext` stellt diese Zugangsinformation getrennt vom fiktiven Profil bereit. Dies ist der Einstiegspunkt für den späteren Abgleich, kein bereits einsetzbarer Auth-Adapter.

## Phase B: Abhängigkeiten und Arbeitsfolge

Die folgenden Spannen sind grobe Planungsschätzungen in konzentrierten Entwicklertagen für jemanden, der React und das gemeinsame Backend kennt. Einarbeitung, schulische Entscheidungen, Datenschutzprüfung und Wartezeiten kommen hinzu. Nach Sichtung der zweiten Version müssen die Schätzungen korrigiert werden. Vor Freigabe und gemeinsamem Datenvertrag beginnt keine Umsetzung.

| Schritt | Ergebnis | Voraussetzung | Grober Aufwand |
| --- | --- | --- | --- |
| B0 Vergleich beider Versionen | Gemeinsamer Architektur-, ID-, Status- und Schnittstellenvertrag; Entscheidung über bestehende Tabellen | Code, Schema, Migrationen und Teststand des zweiten Teams | 1–3 Tage |
| B1 Zugang und Datenquelle | E-Mail-Registrierung, Verifizierung, Sitzung, Abmeldung, getrennte Gast- und Kontodaten | B0, freigegebene Auth-Konfiguration und Rückleitungs-URLs | 2–4 Tage |
| B2 Ein vollständiger Ablauf | Eigene Nachhilfe mit echten Besitzprüfungen, danach Events/Projekte und persönliche Übersicht | B1, serverseitige Regeln, Konflikt- und Fehlermodell | 3–6 Tage |
| B3 Gruppen und Mitgliedschaft | Projekt-/Eventgruppen mit Antrag, Annahme, Austritt und Widerruf | B2, Aufsicht und Sichtbarkeitsregeln | 2–4 Tage |
| B4 Betreute Kommunikation | Persistente Gruppenbeiträge, Meldung, Blockierung und Moderationsablauf | B3, verantwortliche Moderatoren, Schutz- und Löschkonzept | 4–8 Tage |
| B5 Pilot und Absicherung | Tests mit zwei Konten/Geräten, Berechtigungsprüfungen, Wiederverbindung und mobile Abnahme | B1–B4, beaufsichtigte Testgruppe | 2–4 Tage |

### Was wir vom zweiten Team benötigen

Code/Branch, vorhandenes Schema und Migrationen, Auth-/Profilzuordnung und IDs, bestätigte E-Mail-Abläufe, Session-Handling, Rückleitungs-URLs, Schulbeziehungen, Rollen und Datenbankregeln. Außerdem Service-/Hook-Verträge, vorhandene Fehler- und Ladezustände, Realtime-Verwendung, Löschregeln, Moderationszuständigkeit und Testkonten/-umgebung. Keine Passwörter oder privilegierten Schlüssel in Dokumente oder Frontend übernehmen.

Die bereits vorhandene Dokumentation [INTEGRATION.md](INTEGRATION.md) listet die aktuellen Speicherstellen, statischen Importe und Konfliktstellen auf. Die neue persönliche Übersicht ist ein reines Lesemodell; nach dem Abgleich kann dieselbe Darstellung mit serverseitig geladenen Daten gespeist werden. Der lokale Repository-Vertrag bleibt der Ausgangspunkt für den Datenzugriff, wird aber um Ladezustände, Sitzung und serverseitige Versionsprüfung erweitert. Ein ganzer lokaler Snapshot soll nicht ungeprüft als Datenbankmodell übernommen werden.

### Gastmodus und echtes Konto verbinden

Die vorgeschlagene spätere Zugangsgrenze liefert Sitzung/Identität, Fähigkeiten sowie Laden/Fehler; die Kontofunktionen liefern Registrierung, Verifizierungsstatus, Anmeldung, Abmeldung und Session-Änderungen. Die tatsächliche API wird mit der vorhandenen Implementierung des zweiten Teams abgestimmt. Supabase Auth unterstützt die hierfür relevante Identitäts- und Sitzungsverwaltung; dessen vorhandene Einrichtung soll wiederverwendet werden. [Supabase Auth](https://supabase.com/docs/guides/auth)

Beim Moduswechsel wird die Datenquelle vollständig gewechselt: Gastzustand bleibt lokal, Kontodaten werden für die geprüfte Identität geladen. Demo-ID und echter Auth-Subject dürfen nie gleichgesetzt werden. Keine automatische Zuordnung lokaler Projekte, Beiträge oder Anmeldungen zu einem echten Schüler. Falls ein Import überhaupt gewünscht wird: ausdrückliche Auswahl, Vorschau, Validierung, Ausschluss fiktiver Seeds und serverseitige Prüfung. Bei Abmeldung alle kontobezogenen Abonnements und Speicherzustände schließen/leeren, dann eine getrennte Gastdemo öffnen. Authentifizierung darf nicht aus einem localStorage-Flag abgeleitet werden.

### Fachliche Modelle für den gemeinsamen Vertrag

Die folgende Liste bezeichnet Domänenobjekte und erforderliche Informationen, **keine verbindlichen Tabellennamen oder SQL-Entwürfe**.

| Objekt | Benötigte Informationen und Regeln |
| --- | --- |
| Authentifizierte Identität | Opaquer Auth-Subject, geprüfter Sitzungs-/Verifizierungsstatus; Identität aus vertrauenswürdiger Sitzung, niemals aus einem frei gesendeten Profilparameter |
| Profil | Auth-Zuordnung, Anzeigename, geprüfte Schulzuordnung, Interessen, Sprache, freiwillige und widerrufliche Verzeichnisfreigabe; private Daten getrennt von freigegebenen Informationen |
| Schule | Stabile gemeinsame ID, Name, Status, zuständige Koordination; keine unbestätigten Partnerschaften als bestehend markieren |
| Event und Anmeldung | Veranstalter, berechtigte Schulen, Zeitpunkt, organisatorischer Status; getrennte Vormerkung, Anmeldung/Zulassung und nachgewiesene Anwesenheit mit zuständiger Bestätigung |
| Projekt und Mitgliedschaft | Eigentum, Ziel/Planungsstand, Offen-/Geschlossen-Zustand; Interesse, Antrag, Entscheidung, Mitgliedschaft, Austritt und gegebenenfalls Verantwortlichenwechsel |
| Nachhilfe | Angebot/Gesuch, Fachschlüssel/Freitext, Themen, Sprachen, Format, Verfügbarkeit, Offen-/Geschlossen-Zustand und private Kontaktanfrage; keine öffentlichen Kontaktdaten |
| Community-Gruppe | Kontext (Projekt/Event/Thema), Sichtbarkeit, Mitgliedschaftsregeln, Verantwortliche und Moderatoren; Kontextmitgliedschaft und Gruppenrechte ausdrücklich abgleichen |
| Nachricht und Schutzmaßnahmen | Gruppe, Absender, Text, Serverzeit, Bearbeitungs-/Löschzustand, idempotenter Client-Schlüssel; Meldung und Blockierung als getrennte kontrollierte Vorgänge |
| Spielherausforderung | Zwei berechtigte Teilnehmer, freiwillige Anfrage, Annahme/Ablehnung/Rücknahme, serverseitiger Zustand; keine automatische Partie durch bloßes Interesse |
| Schachpartie | Spieler/Farben, Ausgangsstellung, verbindliche Zugfolge, Position, Revision, Zugrecht, Abschlussgrund/Ergebnis und Wiederverbindungsinformationen |
| Auszeichnung | Nachvollziehbarer, bestätigter Auslöser, Regelversion, Aussteller, Empfänger, Sichtbarkeitszustimmung und Widerruf; keine Ableitung aus bloßen Klicks |

### Sichere Kommunikation: Freigabekriterien

Zugriff auf Profile, Gruppen, Beiträge und Entscheidungen muss serverseitig geprüft werden. Der Vorschlag ist, die Regeln auf Datenbankebene abzusichern und mit fremden/nicht angemeldeten Konten negativ zu testen; Supabase stellt hierfür Row Level Security bereit. Privilegierte Schlüssel gehören nicht in den Browser. [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)

Eine reale Nachricht muss zuerst dauerhaft und berechtigt gespeichert werden. Erst danach erhält der Absender eine Bestätigung. Realtime dient der Auslieferung von Änderungen; nach Abbruch lädt der Client fehlende Nachrichten aus der dauerhaften Datenquelle. Abonnements müssen dieselben Gruppenrechte beachten und nach Austritt oder Abmeldung enden. Private Realtime-Kanäle sind eine zu prüfende technische Option. [Supabase Realtime Authorization](https://supabase.com/docs/guides/realtime/authorization)

Vor dem Pilot fehlen insbesondere echte Konten, gemeinsame Speicherung, geprüfte Gruppenrechte, Blockierfunktion, verlässliche Meldestelle und betreute Moderation. Zu entscheiden ist, ob Blockieren Kontakte und Spieleinladungen stoppt und wie Beiträge in gemeinsamen Gruppen behandelt werden, ohne Moderatoren wichtige Meldungen zu verbergen. Keine Telefonnummern/E-Mails in Verzeichnisansichten; sparsame Profilfreigabe, begrenzte Gruppensichtbarkeit, Schutz vor Spam, sichere Übertragung, Aufbewahrungs-/Löschfristen und ein klarer Eskalationsweg müssen abgestimmt werden. Die organisatorische und rechtliche Prüfung verbleibt bei den zuständigen Verantwortlichen.

## Phase C: Optionale Ergänzungen nach Stabilisierung

| Schritt | Abhängigkeit | Grober Aufwand | Freigabekriterium |
| --- | --- | --- | --- |
| C0 Schach-Prototyp und Regelentscheidungen | Stabile Phase B, Blockier-/Einladungsregeln | 2–3 Tage | Zug-/Remis-/Abbruchregeln und Zustandsvertrag geklärt |
| C1 Geräteübergreifendes Schach | C0, verbindlicher Serverzustand und private Synchronisierung | 5–9 Tage | Zwei Geräte, doppelte Züge, Neuverbinden, unberechtigte Zugversuche und Ergebnisse getestet |
| C2 Ein eigenständiges Minispiel | Kern-App stabil, einfache Steuerung und eigene Gestaltung beschlossen | 1–3 Tage | Smartphone-/Desktop-/Tastaturprüfung, Pause und Neustart |
| C3 Optional offline spielbar | C2, Cache-/Update-Konzept | 1–3 Tage | Nach Erstaufruf mit abgeschaltetem Netz tatsächlich getestet |
| C4 Freiwillige Anerkennung | Bestätigte Leistungen aus Phase B und abgestimmte Regeln | 2–4 Tage | Zustimmung, Nachweis, Widerruf und Schutz vor sozialem Druck |

### Schach innerhalb der Community

Einstieg später unter Community → Spiele oder als freiwillige Kontextaktion an einem freigegebenen Profil; kein sechster Hauptnavigationseintrag. Nur zulässige, nicht blockierte Konten dürfen eine Herausforderung senden. Der Empfänger nimmt an oder lehnt ab, der Sender kann eine offene Anfrage zurückziehen. Die Annahme muss atomar genau eine Partie erzeugen. Zunächst keine Zuschauer, öffentliche Rangliste oder Pflichtspielzeit.

Vorgeschlagener Zugablauf: Client sendet Partie-ID, Zug, erwartete Revision und einmalige Anfrage-ID. Ein vertrauenswürdiger Server prüft Mitgliedschaft, Zugrecht, aktive Partie und Legalität, speichert Zug/Position/Revision atomar und veröffentlicht die bestätigte Änderung. Clients zeigen den bestätigten Zustand; bei Revisionskonflikten wird neu geladen. Das verhindert doppelte Züge und konkurrierende Brettstände. Ein selbst geschriebenes vollständiges Regelwerk wäre unnötig riskant; `chess.js` ist ein zu evaluierender Kandidat für Zugvalidierung und Spielzustandsprüfung, ohne die Bibliothek jetzt zu installieren. [Offizielles chess.js-Repository](https://github.com/jhlywa/chess.js)

Vor der Wahl müssen Lizenz, Browser-/Serverkompatibilität und benötigte Remisregeln geprüft werden. Tests brauchen unter anderem Rochade, en passant, Umwandlung, Schach/Schachmatt/Patt, Stellungswiederholung und die vereinbarten Zugzähl-/Remisanspruchsregeln. Eine Bibliothek ersetzt weder serverseitige Identitätsprüfung noch Entscheidungen über Ergebnis, Aufgabe und Abbruch.

Bei Verbindungsabbruch bleibt die Partie gespeichert. Nach Rückkehr lädt der Client den verbindlichen Stand und setzt das Abonnement neu auf. Kein automatischer Sieg allein wegen eines kurzen Netzabbruchs. Aufgabe, vereinbartes Remis, länger verwaiste Partien und eventuelle Uhren müssen vorher geregelt werden; die erste Version sollte ohne Schachuhr auskommen. Kein Zugriff Dritter auf private Partien. Noch existieren keine Herausforderungen oder Partien.

### Minispiele und Offline-Strategie

Sinnvoller erster Kandidat: ein kurzes Paarfindespiel mit selbst gestalteten Symbolen, alternativ ein eigener kleiner Sprung-Runner mit einer einfachen Tippen-/Leertastensteuerung. Beide sollten freiwillig, ohne Konto, Werbung, Kaufanreize oder öffentliche Ranglisten funktionieren. Ein Flappy-artiges Spiel kann später folgen; als erster Prototyp bringt es weniger Nutzen gegenüber einer gut bedienbaren Ein-Tasten-Variante. Barrierearme Bedienung, Pause, Neustart, reduzierte Bewegung und lokale statt vergleichender Bestwerte sind Teil der Abnahme.

Offline ist bislang **nicht implementiert**. Ein späterer Service Worker könnte nur die erforderliche App-/Spielhülle, Skripte, Sprachdateien und eigene Grafiken in einem versionierten Cache halten. Nachrichten, Kontodaten und geschützte Antworten dürfen dabei nicht versehentlich zwischengespeichert werden. Aktualisierungen, alte Cache-Versionen und Rückkehr ins Netz brauchen eigene Tests. Eine erstmalig nie geladene Website ist dadurch nicht automatisch offline verfügbar. [MDN: Using Service Workers](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers)

### Freiwillige Anerkennung

Empfehlenswert sind private, freiwillig teilbare Meilensteine wie „erstes tatsächlich durchgeführtes gemeinsames Projekt“, eine bestätigte Workshop-Organisation oder von Verantwortlichen nachvollziehbar anerkannte Lernunterstützung. Voraussetzung ist ein bestätigter Leistungsnachweis; Interesse, Anmeldung, Demo-Mitgliedschaft und Spieleklicks reichen nicht. Nutzer sollen Sichtbarkeit zurücknehmen können, Aussteller Fehlentscheidungen korrigieren.

Keine Login-Serien, Zeitdruck, öffentlichen Punktetabellen, Belohnung für Nachrichtenmengen oder Benachrichtigungen zur bloßen Nutzungsverlängerung. Kleine persönliche Ziele und Anerkennung gemeinsamer Ergebnisse sind geeigneter als Rangfolgen. Nichtteilnahme an Spielen oder Auszeichnungen darf weder Funktionen noch Lernchancen einschränken. Auszeichnungen sind derzeit ausschließlich Konzept, ohne erteilte Demo-Abzeichen.

## Tests und manuelle Abnahme

Neu automatisiert geprüft werden persönliche Zählungen, Gastfähigkeiten, vergangene Demo-Termine ohne Anwesenheitsbehauptung, Interesse/Anfrage/Annahme/Ablehnung/Austritt, Besitzprüfung, additive Wiederherstellung und parallele Speicheraktionen. Die Renderprüfung umfasst die neuen Unterseiten und beide Seiten des Projektablaufs in allen drei Sprachen. Die vorhandenen Regressionstests bleiben erhalten.

Prüfergebnis: `npm.cmd test` **51/51 erfolgreich**, `npm.cmd run check` **506 nichtleere Übersetzungseinträge je Sprache**, `npm.cmd run check:render` **456 reguläre Seitenkombinationen plus 12 Projektablauf- und 12 Wiederherstellungszustände erfolgreich**, `npm.cmd run build` **erfolgreich**. Die UTF-8-/Sonderzeichenprüfungen bestehen; die zusätzliche Suche nach typischen beschädigten Zeichen ergab keine Treffer. Git meldete keine Whitespace-Fehler, nur den bekannten LF/CRLF-Hinweis für die README. Aktiver Branch bleibt `codex-version-1.0`.

Reales Layout, Touch, Fokus und mehrere Browser-Tabs sind nicht durch serverseitiges Rendering bewiesen. Eine erneute Prüfung des Browserzugriffs ergab weiterhin „The browser access host is unavailable“; eine interaktive Browserabnahme bleibt erforderlich. Prüfen bei 320/375/390 Pixeln und Desktop: persönliche Untertabs, Zählerlinks mit richtiger Vorauswahl, Details und Zurücknavigation, Sprachwechsel, Formularentwürfe und den vollständigen Projektablauf mit zwei Demo-Profilen. Danach erst einen beaufsichtigten Mehrgeräte-Pilot der späteren Phase B planen.

## Betroffene Dateien dieses Schritts

Neu: `src/data/access.js`, `personalArea.js`, `projectParticipation.js`; `src/components/ProjectParticipation.jsx`; `src/pages/PersonalSettings.jsx` (aus bestehendem Formular ausgegliedert); `src/locales/personal/{de,tr,en}.json`; `scripts/personal-area.test.mjs`; dieses Dokument.

Angepasst: `src/data/demoState.js`, `src/state/DemoContext.jsx`, `src/App.jsx`, `src/pages/MyArea.jsx`, `IdeaDetails.jsx`, `src/components/IdeaCard.jsx`, `ParticipationControl.jsx`, `Navigation.jsx`, `src/styles/modules.css`, `src/i18n/LanguageContext.jsx`, `src/locales/{de,tr,en}.json`, `scripts/check-locales.mjs`, `check-render.mjs`, `README.md` und der Ergänzungshinweis in `docs/INTEGRATION.md`. Keine zusätzliche Abhängigkeit, SQL-Migration, Authentifizierung, Git-Commits, Pushes oder Deployments.
