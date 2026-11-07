# Module, lokale Demo und nächster Ausbauschritt

**Historischer Demo-Stand:** Das spätere Live-Backend und sein tatsächlicher Prüfstand stehen in [SESSION_HANDOFF.md](SESSION_HANDOFF.md) und [SUPABASE-SETUP.md](SUPABASE-SETUP.md). Die nachfolgenden lokalen Beschreibungen bleiben zur Einordnung erhalten; sie ersetzen keine aktuelle Mehrnutzer-Abnahme.

## Navigation

| Hauptbereich | Direkt erreichbare Aufgaben |
| --- | --- |
| Start | Eigene Events und Projekte, Empfehlungen, passende Nachhilfe und eigene Community-Beiträge |
| Entdecken | Team-Initiativen, Events, freie Schülerprojekte, Schulen |
| Nachhilfe | Angebote, Gesuche, eigene Einträge und Kontaktentwürfe; Eintrag erstellen |
| Community | Freigegebene fiktive Kurzprofile, Projektpartner, Diskussionsräume, eigene Aktivitäten |
| Mein Bereich | Eigene Listen, vorgemerkte Initiativen und persönliche Demo-Präferenzen |

Die Plus-Aktion im Kopfbereich erstellt ein freies Projekt. Nachhilfe und Community liegen direkt in der mobilen Bottom-Navigation. Lange Untermenüs sind horizontal scrollbar, damit die Touch-Ziele ausreichend groß bleiben. Die bestehenden URLs für Events, Ideen und Schulen bleiben gültig. Detailansichten führen zum Ausgangsbereich zurück.

## Was lokal funktioniert

| Modul | Funktion | Grenze |
| --- | --- | --- |
| Nachhilfe | Angebote und Gesuche mit Fach, Themen, Unterstützung, Sprachen, Format und Verfügbarkeit erstellen; kombinierte Suche und Filter | Nur im Browser gespeicherte Einträge, keine reale Vermittlung |
| Kontaktentwürfe | Interesse vormerken und einen Anfrageentwurf speichern | Kein Versand; keine Kontakt- oder Zahlungsfunktionen |
| Initiativen | Fünf konkrete Formate ansehen und Interesse vormerken | Vorschläge ohne bestätigte Termine oder Teilnehmer |
| Interviews | Initiative zu Sprachen, Identität und Schulalltag ansehen; eine eigene Interviewidee ergänzen | Keine Aufnahmen, Medienuploads oder Veröffentlichungen |
| Freie Projekte | Titel, Beschreibung, optionale Ziele, gesuchte Mitwirkende, freie Themen, gewünschte Schulen und eigenen Planungsstand speichern | Eigener Planungsstand ist keine schulische Freigabe |
| Projektpartner | Projekte entdecken und Mitwirkung bekunden | Gemeinsame lokale Demo-Liste, keine privaten Gruppenräume |
| Personen entdecken | Fiktive Kurzprofile nach Interessen und Namen finden; gemeinsames Interesse sehen und Vernetzungsinteresse vormerken | Keine echten Nutzerprofile oder privaten Nachrichten |
| Verzeichnisfreigabe | Die Sichtbarkeit des aktiven Demo-Profils freiwillig ein- und ausschalten | Betrifft das Verzeichnis; eigene Beiträge und Einträge bleiben getrennt sichtbar. Keine sichere Zugriffskontrolle |
| Diskussionsräume | In vier Themenräumen lokale Beiträge ergänzen und eigene Beiträge entfernen | Nur derselbe Browser; keine geräteübergreifende Kommunikation |
| Meldungen | Grund wählen und eine Meldung zu einem Demo-Profil oder fremden lokalen Beitrag vormerken | Niemand erhält die Meldung; kein laufender Moderationsdienst |

Alle festen Texte existieren auf Deutsch, Türkisch und Englisch. Eigene Inhalte bleiben in ihrer eingegebenen Sprache. Bitte ausschließlich fiktive Daten verwenden und keine Kontaktdaten eingeben.

## Herkunft und Status

- **Team-Vorschlag:** Interviews, Workshops, Austausch, gegenseitige Nachhilfe und freie gemeinsame Projekte sind konkrete vorgeschlagene Formate. Sie sind keine bestätigten Veranstaltungen.
- **Schülerinitiative:** Ein lokal eingereichtes Projekt gehört zur aktiven Demo-Persona und bleibt frei gestaltbar. Das Interviewformat ist eine freiwillige Verknüpfung.
- **Bestätigte reale Aktivität:** Dafür existiert derzeit kein Datensatz. Die App behauptet keine Durchführung oder organisatorische Freigabe.
- **Demo-Beispiel:** Vorgegebene Events, Nachhilfeeinträge und Kurzprofile sind ausdrücklich fiktiv. Eventtermine sind keine echten Zusagen.

Das Interviewkonzept folgt README Modul 5: Erfahrungen an verschiedenen Schulen, Beziehungen zu Sprachen, Ländern und Kulturen. Vor einer tatsächlichen Aufnahme oder Veröffentlichung sind Einwilligungen und redaktionelle beziehungsweise schulische Abstimmungen zu klären.

## Datenmodell und Migration

Die bestehenden React-Komponenten, Hash-Navigation, Sprachverwaltung und Demo-Personas werden weiterverwendet. Es wurden keine zusätzlichen Pakete installiert.

- `src/data/modules.js`: Initiativen, Themenräume, Nachhilfe-Beispiele, Sichtbarkeit, Interessen, Kontaktentwürfe, Beiträge, Meldungen und reine Zustandsfunktionen.
- `src/data/demoState.js`: übernimmt die Erweiterung in den bisherigen versionierten Zustand. Beim Laden alter Daten werden fehlende Module ergänzt; vorhandene Präferenzen, Teilnahmen und Ideen bleiben erhalten.
- `src/pages/`: getrennte Übersichten, Eingaben und Detailansichten für die neuen Aufgaben.
- `src/components/`: gemeinsame Formfelder, Modulnavigation, Nachhilfe-/Community-Karten, Interessen- und Meldeaktionen.
- `src/locales/modules/`: vollständige neue Texte in DE/TR/EN; bestehende Texte bleiben zentral erhalten.
- `src/styles/modules.css`: gezielte Ergänzungen zur bestehenden visuellen Gestaltung.

Die Herkunft `team` bezeichnet redaktionelle Vorschläge, keine clientseitig erteilte Betreiberberechtigung. Es gibt weder ein Admin-Login noch ein echtes Rollenmodell. Bei einem späteren Backend müssen alle Änderungen und Zugriffe dort geprüft werden.

### Profilabhängige Beispiele

Alex bietet in der Demo Mathematikhilfe an und sucht Unterstützung in Informatik. Deniz sucht Mathematikhilfe und bietet Deutschübungen an. Alex sieht daher das Mathematikgesuch, Deniz das passende Mathematikangebot. Interessen und eigene Einträge beeinflussen die Vorschläge; Sprache und Format werden bei direkten Zuordnungen berücksichtigt. Die Anzeige ist keine Eignungsprüfung eines Nachhilfegebers.

Alex startet ohne Verzeichnisfreigabe; Deniz ist als fiktiv freigegebenes Beispiel hinterlegt. Ein weiteres ausdrücklich fiktives Beispielprofil „Mika“ demonstriert gemeinsame Technik-/Wissenschaftsinteressen. Keine dieser Personen ist ein authentifiziertes Konto. Beiträge werden nicht erfunden: Die Räume beginnen leer und zeigen nur im Browser erzeugte Demo-Beiträge.

## Was ein echter Betrieb braucht

1. **Geprüfte Identitäten und schulische Zuordnung:** Authentifizierung, geschützte Sitzungen und nachvollziehbare Aufnahmeprozesse für Schüler und Verantwortliche. Keine Berechtigungen aus frei veränderbaren Browserwerten ableiten.
2. **Gemeinsamer Datendienst:** Eine API und Datenbank für Profile, Freigaben, Einträge, Projektmitwirkung, Raumzugehörigkeit, Beiträge und Meldungen. Eigentümerschaft und Zugriffe serverseitig prüfen. Die lokale Zustandsverwaltung kann an dieser Grenze ersetzt werden.
3. **Kommunikation zwischen Geräten:** Beiträge zentral speichern und berechtigt abrufen; je nach Bedarf Polling, Server-Sent Events oder WebSockets ergänzen. Zustellung oder Benachrichtigungen erst anzeigen, wenn sie tatsächlich belegt sind.
4. **Privatsphäre:** Minimale Kurzprofile, freiwillige Verzeichnisfreigabe und nachvollziehbare Rücknahme. Sichtbarkeit von Profil, Projektmitwirkung und Beiträgen getrennt steuern. Persönliche Kontaktdaten nicht als öffentliches Vermittlungsinstrument verwenden.
5. **Schutz und Moderation:** Mit den Schulen betreute Themenräume, erreichbare Meldestellen, menschliche Zuständigkeiten, Sperr-/Eskalationswege und Regeln gegen Missbrauch festlegen. Meldungen müssen dann wirklich zugestellt und bearbeitet werden können. Insbesondere den Schutz Minderjähriger organisatorisch absichern.
6. **Betrieb und Freigaben:** Betreuungs- und Nachhilferegeln, Datenspeicherung und Löschabläufe, Sicherungen und Medienfreigaben mit den Schulen abstimmen. Ein Echtzeitdienst oder eine bloße Rollenanzeige erfüllt diese Aufgaben nicht.

Diese Komponenten wurden nicht eingerichtet. Echte Konten, Datenbank, öffentliche Kommunikation und Veröffentlichung benötigen einen gesonderten Auftrag.

## Prüfung und manuelle Abnahme

Automatisiert bestanden: 21 Tests, je 374 nicht leere Übersetzungseinträge mit passenden Schlüsseln und Kodierungsprüfung, 57 Routen × zwei Profile × drei Sprachen = 342 Renderkombinationen sowie Produktions-Build. Der lokale Vite-Start und HTTP-Antworten der neuen Module wurden erfolgreich geprüft.

Der Browserzugriff der Arbeitsumgebung meldet weiterhin `The browser access host is unavailable`. Deshalb wurden Touch-Bedienung, tatsächliche Bildschirmdarstellung und Browserinteraktionen nicht visuell geprüft. Render- und Zustandstests ersetzen diese Prüfung nicht.

Für die manuelle Abnahme lokal starten: `npm.cmd run dev`.

1. Nachhilfeangebot und Gesuch mit fiktiven Texten anlegen; Fach, Sprache, Format und Suchtext kombiniert filtern.
2. Profil wechseln und Interesse sowie einen Kontaktentwurf speichern. Prüfen, dass kein Versand behauptet wird und eigene Einträge getrennt bleiben.
3. Interview-Initiative öffnen, Interesse vormerken und eine eigene Interviewidee erstellen.
4. Ein freies Projekt mit neuen Themen, Zielen und gesuchten Mitwirkenden erstellen, ohne ein Format zu wählen.
5. Verzeichnisfreigabe umschalten und mit der anderen Persona die Personen- und Interessensuche prüfen.
6. Einen lokalen Raumbeitrag schreiben; mit der anderen Persona eine Demo-Meldung vormerken. Eigene Beiträge entfernen und den fehlenden realen Versand prüfen.
7. Seite neu laden und die gespeicherten lokalen Interaktionen kontrollieren.
8. Alle drei Sprachen, Tastaturbedienung und Smartphone-/Desktopbreiten kontrollieren; insbesondere scrollbare Modul-Tabs und den Abstand zur Bottom-Navigation.
