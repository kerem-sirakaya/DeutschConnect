# Navigation, Schülerprofile und Statistiken

Stand: 8. November 2026. Lokale Implementierung auf `codex-version-1.0`; keine Commits, Pushes, Migrationen oder Cloud-Änderungen durch diesen Auftrag.

## 1. Bestandsaufnahme und tatsächliche Nutzerwege

README, AGENTS, SESSION_HANDOFF, Router, Seiten, Karten, Speicherlogik und serverseitige Datenprojektion wurden geprüft. Alle neun vorhandenen Designbilder unter `design references/` wurden angesehen. `docs/design-references/` existiert nicht. Navy, blaue Akzente, Karten, Filterchips und die fünf Hauptbereiche bleiben erhalten.

| Bisheriger Weg / Problem | Änderung und erreichbare Funktion |
| --- | --- |
| Start wiederholte Entdecken, Nachhilfe und Community direkt über der Hauptnavigation | Zusätzliche Schnellnavigation entfernt; dieselben Hauptbereiche bleiben in der Hauptnavigation und mobil in der Bottom-Navigation erreichbar. |
| Globales unbeschriftetes Plus führte auch aus Nachhilfe, Gruppen und Spielen zur Projekterstellung | Entfernt. Erstellung unter Entdecken → Projekte, im persönlichen Projektbereich und im konkreten Interviewablauf. |
| Hauptnavigation „Mein Bereich“ plus zusätzliche Avatar-Navigation | Avatar-Link entfernt; persönlicher Bereich bleibt ein Hauptziel. |
| Persönlicher Bereich zeigte acht gleichrangige Untertabs, klickbare Statistiken und wiederholte Bereichslinks | Ein zentraler Überblick mit beschrifteten Einträgen, eigenen Unterseiten und Rückweg. Zahlen sind Anzeigen. Persönliche Unterseiten tragen ihren konkreten Titel. |
| Projekte erschienen als eigener Community-Tab und unter Entdecken | Hauptort ist Entdecken → Projekte. Alter Community-Projektweg bleibt für bestehende Verweise funktional. |
| Eventlisten hatten einen zusätzlichen persönlichen Tab; Projektformulare boten Navigation zu anderen Listen | Persönliche Verwaltung ist über Mein Bereich erreichbar. Im Formular bleibt der zusammenhängende Ablauf mit Rückweg, Speichern und Abbrechen. |
| Karten verlinkten Titel und Pfeil/„Details“ mehrfach auf dasselbe Ziel | Bei Event-, Ideen-, Nachhilfe-, Personen-, Initiativen-, Gruppen- und Schulkarten jeweils den zusätzlichen Link entfernt. Titel bleiben mit ausreichend großer Touchfläche erreichbar. |
| Gruppen- und Spielunterseiten wiederholten alle Community-Untertabs | Untertabs nur in der Übersicht; Detailansichten haben einen Rückweg. |
| Anmeldung und persönlicher Überblick verlinkten zusätzlich auf Spiele | Spiele bleiben unter Community → Spiele erreichbar. |
| Profilfreigabe lag im Personenverzeichnis neben der Suche | Freigabe unter Mein Bereich → Profil & Einstellungen; Entdecken anderer Personen und eigene Einstellungen sind getrennte Aufgaben. |
| Speichern führte vom Formular per zusätzlichem History-Eintrag zur Detailseite | Der gespeicherte Inhalt ersetzt den Formular-Eintrag. Zurück führt zum Einstieg des Ablaufs statt zum leeren Formular. |

## 2. Informationsarchitektur

- **Start:** kompakte persönliche Auswahl vorhandener Inhalte und Empfehlungen.
- **Entdecken:** Initiativen einschließlich Interviews/Austausch, Events/Workshops, Projekte/freie Ideen und Schulen.
- **Nachhilfe:** Angebote, Gesuche, eigene Einträge/Kontaktentwürfe und Vormerkungen; Erstellen und Bearbeiten im selben Ablauf.
- **Community:** freigegebene Personen, Gruppen/Beiträge, Spiele einschließlich Schach und eigene Community-Aktivität.
- **Mein Bereich:** eigene Aktivitäten, Projekte, Nachhilfe, Vormerkungen, Community-Aktivität, Auszeichnungen, Konto und Profil/Einstellungen; Moderation nur für berechtigte Konten.

Persönliche Übersichten aggregieren bestehende Module; sie schaffen keine zweite Datenhaltung. Frühere URLs, einschließlich `/events/my`, `/ideas/my`, `/community/projects` und persönlicher Unterseiten, bleiben erreichbar. Kontextlinks zu Schule, zugehöriger Gruppe oder freiwillig freigegebenem Autor bleiben erhalten.

`routeHistory.js` versieht interne History-Einträge mit Routeninformationen. Zurück nutzt den tatsächlichen Verlauf, direkte Detailaufrufe erhalten ein geprüftes internes Ersatz-Ziel. Abgelehnte Navigation bei nicht speicherbaren Entwürfen stellt die History-Position wieder her. Filter und Entwürfe bleiben im vorhandenen profil- und tabgetrennten sessionStorage. Es gibt keine zusätzlichen Router-Abhängigkeiten und keine automatische Navigation in neue Tabs.

## 3. Einheitliche Schülerprofile

`StudentProfile.jsx` ersetzt die bisherige Profilansicht in `Community.jsx`. Alle Autor- und Mitgliederverweise benutzen `ProfileLink.jsx` und dieselbe Route `/community/people/:id`.

Verknüpft sind Projektkarten/-details, Projektmitglieder, Nachhilfedetails, Community-Beiträge, Gruppenmitglieder und Eventverantwortliche. Ein nicht freigegebener oder blockierter Schüler erhält keinen öffentlich aufrufbaren Profil-Link. Namen können für berechtigte Mitglieder innerhalb einer tatsächlichen Arbeitsgruppe weiterhin sichtbar sein.

Der vorherige Profilfilter verknüpfte interessenmäßig passende Projekte mit einer Person. Das war kein Aktivitätsnachweis und wurde ersetzt:

- Eigene veröffentlichte Ideen beruhen auf `ownerId`.
- Mitgliedschaften beruhen auf angenommenen `participantIds`.
- Abschlüsse beruhen auf einem moderierten Nachweis und dessen festgehaltenen Mitgliedern.
- Interessenbekundungen, offene Anfragen und Empfehlungen werden nicht als Mitgliedschaft oder Leistung ausgegeben.

## 4. Persönliche Statistiken

Alle Zahlen werden aus vorhandenen Datensätzen berechnet; keine gespeicherten Summen und keine erfundenen Erfolgszahlen.

| Sichtbare Kennzahl | Regel |
| --- | --- |
| Aktuelle Projekte mit eigener Beteiligung | Eigene Projekte oder angenommene Mitgliedschaft; nicht gelöscht, zurückgezogen oder bestätigt abgeschlossen. |
| Bestätigte Projektabschlüsse | `completion.confirmedBy`, gültiger vergangener Bestätigungszeitpunkt und eigene ID in eingefrorenen `completion.memberIds`. |
| Selbst erstellte Projektideen | Eigene nicht gelöschte Ideen, einschließlich weiterhin gespeicherter zurückgezogener Ideen. Kein Umsetzungsnachweis. |
| Kommende Eventanmeldungen | Eigener Status `joined`, zukünftiger Termin, nicht abgesagt. |
| Bestätigte Veranstaltungsteilnahmen | Freigegebenes, nicht abgesagtes Event in der Vergangenheit und eigener organisatorischer Anwesenheitsnachweis. Eine Anmeldung reicht nicht. |
| Offene Nachhilfeangebote/-gesuche | Eigene aktive Datensätze des jeweiligen Typs. Kontaktentwürfe zählen nicht als Nachhilfeteilnahme. |
| Auszeichnungen | Tatsächlich gespeicherte eigene serverseitige Anerkennungen. Demo-Speicher liefert keine verifizierten Auszeichnungen. |

Die bisherigen Interessen-, Anfrage-, Mitgliedschafts- und Vormerkungslisten bleiben verfügbar. Eigene Eventvorschläge erscheinen auch ohne Anmeldung in der persönlichen Organisation. Alte Registrierungen bleiben archiviert, werden aber nicht zu Teilnahmebelegen.

## 5. Freiwillige Sichtbarkeit und Backend

Neue echte Konten bleiben standardmäßig ohne Verzeichnisfreigabe. Auch bei aktiviertem Profil sind optionale Angaben zunächst aus:

- `profileSharing.school`: Schule.
- `profileSharing.interests`: Kategorien und selbst angegebene Interessen.
- `profileSharing.projects`: veröffentlichte eigene Ideen, aktuelle Mitgliedschaften und bestätigte Projektabschlüsse.
- Bereits vorhandenes `awardSharing`: gesonderte Freigabe von Auszeichnungen.

Die Hauptfreigabe `modules.visibility` muss zusätzlich aktiv sein. Die öffentliche Ansicht enthält keine E-Mail, Telefonnummer, Auth-Daten, Kontaktentwürfe, Einstellungen, Vormerkungen, Anfragen, privaten Beiträge oder Eventanmeldungen. Gruppenrechte bleiben unverändert serverseitig geprüft. Ein Rückzug der Profilfreigabe löscht veröffentlichte Inhalte nicht; diese Unterscheidung wird erklärt.

`projectPlatform` erzeugt die erlaubten `modules.publicProfiles` auf dem Server. Optionale Profildaten sowie für Außenstehende nicht freigegebene Mitglieds-IDs werden vor dem Senden entfernt. Auch die automatisch zugeordnete Schule in fremden Projekt-/Nachhilfeeinträgen wird ohne Freigabe zurückgehalten. Freigegebene Auszeichnungen liefern Außenstehenden keine privaten Eventbeziehungen oder ausstellenden Konto-IDs. Organisierende, tatsächliche Gruppenmitglieder und Moderatoren behalten die für ihre Aufgaben zulässigen Kontextdaten.

Projektabschlüsse können ausschließlich durch `confirmProjectCompletion` mit serverseitig verifizierter Moderatorrolle bestätigt werden. Der Server schreibt Zeitpunkt, bestätigende Identität und die zu diesem Zeitpunkt akzeptierten Mitglieder einschließlich Autor. Offene Anfragen werden geschlossen; spätere neue Mitgliedschaften sind für abgeschlossene Projekte gesperrt. Gewöhnliche Projektbearbeitung kann diesen Nachweis nicht setzen. Ein späterer Austritt löscht den historischen Nachweis nicht. Die organisatorische Wahrheit muss die Moderation tatsächlich prüfen; Software kann die Durchführung nicht selbst beobachten.

Das bestehende JSONB-Modell bleibt erhalten. `profileSharing` und `completion` sind additive Felder; kein SQL-Schemawechsel und keine Migration. Die bisherige API-/RLS-Architektur wird weiterverwendet.

**Bereitstellungsgrenze:** Die geänderte Edge Function und die neue gemeinsame Datei `_shared/profiles.js` sind ausschließlich lokal vorbereitet. Keine Cloud-Function wurde bereitgestellt. Der neue Client benötigt `profileCapabilities` vom Server, bevor er erweiterte Freigaben oder neue Profilaktivierung für echte Konten anbietet. Eine vorhandene Freigabe lässt sich weiterhin zurücknehmen. Bestehende serverseitige Freigaben des älteren Cloud-Stands werden durch diesen lokalen Auftrag nicht rückwirkend geändert. Vor realem Einsatz der neuen Freigaberegeln muss der eigene Serverstand gesondert geprüft und freigegeben aktualisiert werden.

## 6. Demo und gemeinschaftliche Wirkung

Gastprofile und deren Aktivitäten bleiben ausdrücklich fiktiv und lokal. Freigaben lassen sich dort erproben und bleiben nach Neuladen erhalten. Gastprofile können keine verifizierten Projektabschlüsse oder Anerkennungen erzeugen. Der Demo-Speicher übernimmt entsprechende selbst eingetragene Nachweise nicht. Bestehende echte Konten und Demo-Personas werden weiterhin getrennt gehalten.

Unter „Über DeutschConnect“ steht ein ehrlicher Wirkungsstatus ohne Gesamterfolgszahlen. Die Schulzugehörigkeit ist bislang Selbstauskunft; eine Liste von Schulnamen und vergangene Termine belegen keine durchgeführte schulübergreifende Kooperation. Gemeinschaftliche Kennzahlen benötigen später abgestimmte organisatorische Nachweise. Es wurden keine Tracking-, Telemetrie- oder Ranglistenfunktionen ergänzt.

## 7. Betroffene Dateien

| Bereich | Dateien |
| --- | --- |
| Routing | `src/App.jsx`, neu `src/state/routeHistory.js`, `src/data/navigation.js`, `src/components/BackLink.jsx` |
| Haupt-/Modulnavigation | `src/components/Navigation.jsx`, `ModuleNavigation.jsx`; `src/pages/Home.jsx`, `Discover.jsx`, `Events.jsx`, `Ideas.jsx`, `Games.jsx`, `Account.jsx` |
| Karten, Profil- und Kontextlinks | `src/components/CommunityCards.jsx`, `EventCard.jsx`, `IdeaCard.jsx`, `TutoringCard.jsx`, `SchoolCard.jsx`, `ProjectParticipation.jsx`; `src/pages/Community.jsx`, `IdeaDetails.jsx`, `TutoringDetails.jsx`, `EventDetails.jsx`; neu `ProfileLink.jsx`, `StudentProfile.jsx`, `src/data/profiles.js` |
| Eigene Daten und Abläufe | `src/pages/MyArea.jsx`, `PersonalSettings.jsx`, `IdeaSubmit.jsx`, `TutoringNew.jsx`, `EventNew.jsx`, `Moderation.jsx`, `About.jsx`; `src/data/demoState.js`, `personalArea.js`; neu `ActivityStatistics.jsx`; `src/components/ActionButton.jsx` |
| Gestaltung und Sprachen | `src/styles/modules.css`, `src/locales/personal/{de,tr,en}.json` |
| Serverseitige Regeln | `supabase/functions/_shared/platform.js`, neu `profiles.js` |
| Prüfungen | `scripts/backend.test.mjs`, `personal-area.test.mjs`, `check-render.mjs`; neu `profiles-statistics.test.mjs`, `route-history.test.mjs` |
| Dokumentation | dieses Dokument, `README.md`, `docs/SESSION_HANDOFF.md` |

## 8. Prüfungen und Grenzen

- `npm.cmd test`: 95 Tests bestanden; darunter Freigabe/Entzug, unbekannte Freigabefelder, Autorenschaft vs. Anfrage/Mitgliedschaft, Moderatorabschluss, historische Mitgliedschaft, korrekte Eventzählung, alte Serverantworten sowie History-Verträge.
- `npm.cmd run check`: 734 vollständige Texte je Sprache; gleiche Schlüssel, gültiges UTF-8.
- `npm.cmd run check:render`: 86 Demo-Routen pro Persona und Sprache; 101 beziehungsweise 94 erzeugte Linkziele pro Persona ohne Fehlerseite. Zusätzlich Konto-/Recovery-/Projekt-/Schachansichten und acht neue verbundene Profil-, Beitrags- und Abschlussansichten je Sprache. Alte Serverantworten aktivieren keine neuen Profilfreigaben.
- `npm.cmd run build -- --configLoader native`: erfolgreich; Größenwarnung für das JavaScript-Bundle über 500 kB bleibt.
- `npm.cmd run check:offline`: fünf gebaute statische Ressourcen ohne simuliertes Netz; private/API-Anfragen ausgeschlossen.
- `node --check supabase/functions/platform/index.ts`, `node --check supabase/functions/_shared/profiles.js`, `git diff --check`: erfolgreich. LF/CRLF-Hinweise sind keine Fehler.

Die Sandbox blockierte zunächst das vorhandene native Rollup-Modul. Renderprüfung und Build liefen nach gezielter Ausführung außerhalb der Sandbox erfolgreich; keine Pakete neu installiert und keine Windows-Sicherheitsrichtlinien geändert.

**Nicht praktisch abgenommen:** echte Browserklicks, Touch, Fokus, responsive Screenshots und Back/Forward auf einem Smartphone. Browserzugriff meldete einen nicht verfügbaren Host; der native Versuch lieferte eine unpassende Fensteraufnahme und wurde beendet. Deshalb keine erfolgreiche Browser- oder Mobilabnahme behaupten. Die History-Tests simulieren den Browservertrag; Renderprüfungen sind keine Layouttests. Kein erneuter Cloud- oder Zwei-Konten-Live-Test.

## 9. Nächste Schritte

1. Lokal die unten genannten Nutzerwege im funktionierenden Browser auf Desktop und Smartphone abnehmen.
2. Änderungen an der eigenen Edge Function einschließlich `_shared/profiles.js` prüfen und nach gesonderter Freigabe bereitstellen; keine neue Datenbankmigration notwendig.
3. Mit zwei kontrollierten echten Konten Freigabe/Entzug, Projektmitgliedschaft, Moderatorabschluss und Datenschutz direkt an API-Antworten prüfen. Frühere Cloud-Grenzen bei E-Mail-Versand und erreichbarer Testadresse bleiben bestehen.

Manuelle Abnahme: Eventfilter → Detail → Zurück; Projektformular aus einer Liste → verlassen → Entwurf wieder aufnehmen → speichern → Zurück; freiwilliges Profil aus Projekt/Nachhilfe/Beitrag/Gruppe öffnen → zur Quelle zurückkehren; Sichtbarkeit je Feld aktivieren und zurücknehmen; Interesse/Anfrage/Annahme/Abschluss getrennt zählen; Community-Spiele einschließlich Schach und vorhandene Anmeldung aufrufen. Jeweils DE/TR/EN sowie schmale Mobilansicht und Tastatur prüfen.
