# Gemeinsame Version: Datenzugriffe und Integrationsgrenzen

**Aktualisierung zum 8. November 2026:** Das eigenständige Supabase-Setup ist inzwischen eingerichtet und der grundlegende Auth-Ablauf live bestätigt. Aktueller Tagesstand und Integrationsprüfpunkte: [SESSION_HANDOFF.md](SESSION_HANDOFF.md). Cloud-Architektur und Nachweise: [SUPABASE-SETUP.md](SUPABASE-SETUP.md). Die folgende lokale Bestandsaufnahme bleibt als historische Grundlage erhalten; sie ist weder das heutige Cloud-Schema noch ein bereits mit Ege abgestimmter Datenvertrag.

Stand: 7. November 2026. Dieses Dokument beschreibt die vorhandene lokale React/Vite-Version. Es legt **keine** Supabase-Tabellen, Authentifizierung oder gemeinsame Datenbankarchitektur fest. Vor einer Anbindung müssen beide Implementierungen verglichen werden.

Ergänzung zur anschließenden Phase A: Projekte besitzen nun additive `interestedIds` und `requestedIds` neben den weiterhin ausschließlich lokalen Demo-Mitgliedschaften in `participantIds`. Persönliche Zählungen werden über `src/data/personalArea.js` berechnet; `src/data/access.js` trennt Gastfähigkeiten von fiktiven Profil-IDs. Der aktuelle Umsetzungsstand und die Modelle/Abhängigkeiten für echte Konten, Gruppen, Nachrichten, Spiele und Auszeichnungen sind in [PHASES-B-C.md](PHASES-B-C.md) dokumentiert. Die folgenden Tabellen bleiben die Bestandsaufnahme der lokalen Speichergrenze; sie sind kein gemeinsames Datenbankschema.

## Aktuelle Datenmodelle

| Bereich | Derzeitiges Modell und Herkunft |
| --- | --- |
| Nutzer | Zwei fiktive Profile `alex` und `deniz`: `id`, `displayName`, `schoolId`, `interests`, optional `customInterests`, `language`. Das zusätzliche Verzeichnisbeispiel `guest-mika` ist ein statischer Datensatz. Keine dieser IDs bezeichnet ein authentifiziertes Konto. |
| Schulen | `id`, `initials`, `name`, `city` aus `src/data/activities.js`; Beschreibung und Status aus den Sprachdateien. `ers` und `anka` sind lokale Schlüssel. |
| Events | Statische `activities`: `id`, `category`, `icon`, `hostSchoolId`, `schoolIds`, `startsAt`. Texte aus den Sprachdateien. `hostSchoolId` bezeichnet die veranstaltende Schule; `schoolIds` die zugelassenen Demo-Schulen. Alle Termine bleiben fiktiv. |
| Eventteilnahme | `participation[profileId][eventId]` mit `interested`, `joined` oder `organized`. Rücknahme entfernt den Eintrag. Keine echte Anmeldung oder Einladung. |
| Projekte | `ideas[]`: `id`, `ownerId`, `schoolId`, `participantIds`, `category`, `title`, `description`; optional `goals`, `collaborators`, `topics`, `desiredSchoolIds`, `projectStatus`, `initiativeId`. Unbearbeitete Beispiele verwenden `seedKey` oder `seedIndex` statt eigener Texte. |
| Projektverwaltung | `projectStatus` ist der eigene Planungsstand (`proposal`, `looking`, `preparing`), keine schulische Genehmigung. `lifecycle` ist getrennt davon `active`/fehlend, `withdrawn` oder `deleted`. Bearbeitungen materialisieren übersetzte Beispieltexte als eigenen Originaltext. |
| Nachhilfe | `modules.tutoring[]`: `id`, `ownerId`, `schoolId`, `kind` (`offer`/`request`), `subject`, optional kanonischer `subjectKey`, `topics`, `description`, `languages`, `format`, `availability`. Unbearbeitete Beispiele tragen `seed: true` und beziehen Texte aus den Sprachdateien. `lifecycle`: offen, `closed`, `deleted`. |
| Community | `modules.visibility[profileId]` ist nur die freiwillige lokale Verzeichnisfreigabe. `messages[]` enthält `id`, `ownerId`, `roomId`, `body`. Vier feste Räume: `general`, `learning`, `projects`, `events`. Beiträge sind ausschließlich lokal. |
| Vormerkungen | `modules.interests[profileId]` enthält Schlüssel wie `tutoring:math-offer`, `person:deniz`, `initiative:interviews`. Projektmitwirkung steht dagegen in `participantIds`. |
| Entwürfe und Meldungen | `contactDrafts[]`: `ownerId`, `targetId`, `note`; `reports[]`: `ownerId`, `targetType`, `targetId`, `reason`. Nichts davon wird versendet oder von Moderatoren bearbeitet. |
| Initiativen | Statische `initiatives` in `modules.js`: `id`, `icon`, `source: team`, `stage: proposal`, `demo`. Dies sind vorgeschlagene Formate, keine bestätigten Aktivitäten. |

Projekte und Nachhilfe behalten bei Änderungen einen lokalen `history`-Verlauf mit Aktion, Persona und Zeitpunkt sowie Löschmarkierungen. Frühere Textfassungen werden dabei nicht gespeichert. Das ist **kein** revisionssicheres Audit und keine produktive Datenschutz- oder Aufbewahrungsregel. Die Regeln für endgültiges Löschen, Backups und Aufbewahrung müssen gemeinsam festgelegt werden.

## Speicherstellen

| Speicher | Stelle | Inhalt |
| --- | --- | --- |
| `localStorage` | `src/state/localRepository.js`, über `DemoContext.jsx` injiziert | Gemeinsamer Demo-Snapshot unter `deutschconnect.demo.v1`; additive `_persistence`-Metadaten mit Revision und Writer-ID. |
| `localStorage` | `localRepository.js` | Unveränderte Originalstände vor einer bereinigten Speicherung unter `deutschconnect.demo.v1.recovery.*`. Keine automatische Löschung oder Wiederherstellung dieser Sicherungen. |
| `localStorage` | `src/i18n/LanguageContext.jsx` | `deutschconnect.language` als Startpräferenz. Die aktive Demo-Persona hat zusätzlich ihre eigene Sprache. |
| `sessionStorage` | `src/state/DemoContext.jsx` | `deutschconnect.demo.persona`: je Tab ausgewähltes Demo-Profil. Ein anderer Tab darf diese Auswahl nicht wechseln. |
| `sessionStorage` | `src/state/pageMemory.js` und `usePageMemory.js` | `deutschconnect.page.v1:<profile>:<scope>` für Suchfilter und ungespeicherte Formulare, getrennt nach Persona, Modul und Eintrag. Edit-Entwürfe enthalten den ursprünglichen Vergleichsstand. |

Beim Start liest das Repository ausschließlich. Gültige Felder und Datensätze werden einzeln übernommen; beschädigte Teile führen zu einem sichtbaren Wiederherstellungshinweis. Vor dem ersten bereinigenden Schreibzugriff wird das Original gesichert. Fehler beim Sichern oder Schreiben lassen den bestehenden Snapshot unverändert.

Mutationen laufen über `dispatch(action): Promise<boolean>` und werden mit einer Web-Locks-Sperre gegen den **zuletzt gespeicherten** Stand ausgeführt. Die Persona wird beim Aufruf eingefroren. `storage`-Ereignisse laden fremde Änderungen neu. Bearbeitungsformulare vergleichen zusätzlich ihren ursprünglichen Datensatz, damit veraltete Formulare neuere Änderungen nicht still überschreiben. Bei Konflikten bleibt die Eingabe erhalten.

Ohne verfügbare Web Locks werden Schreibaktionen vorsichtig abgelehnt; Lesen, Sprachwahl und Sicherung bleiben möglich. `localStorage` allein bietet kein atomares Compare-and-set. Alte App-Versionen, Browserwerkzeuge oder fremder Code, die dieselbe Sperre ignorieren, können nicht vollständig kontrolliert werden. Alle Tabs sollten deshalb dieselbe aktuelle Version verwenden. Browserdaten können weiterhin vom Nutzer oder Browser gelöscht werden; lokale Speicherung ist keine dauerhafte Datensicherung und keine geräteübergreifende Synchronisierung.

## Direkte statische Importe

- `activities.js`: Events und Schulen werden in `Events.jsx`, `EventDetails.jsx`, `Network.jsx`, `HeroSection.jsx`, `IdeaDetails.jsx`, `IdeaSubmit.jsx` und `MyArea.jsx` direkt genutzt. `EventCard.jsx` nutzt Darstellungshelfer. `demoState.js` nutzt diese Kataloge für Validierung, persönliche Eventlisten und Empfehlungen.
- `modules.js`: `Discover.jsx` nutzt die Initiativen, `Community.jsx` die Raumliste und Verzeichnisauswahl. Nachhilfeseiten und `TutoringCard.jsx` nutzen Darstellungs-, Filter- und Validierungsfunktionen; `ReportControl.jsx` die Meldegründe. Diese Datei enthält auch die Nachhilfe-Seeds und das fiktive Gastprofil.
- `demoState.js`: erzeugt Profile und Projekt-Seeds. `Home.jsx`, `Ideas.jsx` und `MyArea.jsx` importieren Auswahlfunktionen. Der persistente Zustand selbst wird den Seiten über `DemoContext` bereitgestellt.
- `src/locales/{de,tr,en}.json` und `src/locales/modules/*`: enthalten neben Oberflächentexten auch übersetzte Beispielinhalte für Events, Projekte, Nachhilfe und Initiativen. Eigene Texte werden in ihrer Originalsprache gespeichert. `locales/quality/*` enthält ausschließlich die neuen Bedien- und Fehlermeldungen.

Bei einer echten Datenanbindung müssen Inhaltskataloge aus den Oberflächenübersetzungen gelöst und über definierte Abfragen geliefert werden. Stabile Format-, Status- und Sprachschlüssel können weiterhin lokal bleiben. Die reinen Matching-Regeln in `src/data/matching.js` hängen weder von React noch vom Speicher ab.

## Sinnvolle spätere Schnittstellen

Die kleine neue Grenze ist `createLocalRepository({storage, locks, language})` in `src/state/localRepository.js`. Sie bietet `getSnapshot`, `subscribe`, `dispatch`, `reloadStorage`, `exportRecovery` und den lokalen Storage-Event-Einstieg. `DemoContext` verbindet sie mit React. Ein späterer Dienst kann hinter dieser Grenze eingebunden werden; dazu werden Lade-, Fehler- und Berechtigungszustände sowie serverseitige Konfliktprüfung ergänzt. Der gegenwärtige Snapshot muss dabei nicht als einzelne Datenbankzeile übernommen werden.

Gemeinsam festzulegen sind Abfragen für Profile und Freigaben, Schul- und Eventkataloge, eigene Teilnahmen, Projektlisten/Mitwirkung, Nachhilfe, Vormerkungen sowie Community-Räume/Beiträge und Meldungen. Schreibschnittstellen müssen mindestens Anlegen, Bearbeiten mit Versionsprüfung, Zurückziehen/Schließen, Entfernen und Teilnahmeänderungen abdecken. Auch Fehlercodes, Pagination und Rückgabewerte brauchen einen gemeinsamen Vertrag.

Demo-Auswahl und `actorId` dürfen später **keine Berechtigung** vermitteln. Der Server muss die handelnde Identität aus der echten Sitzung ableiten und Eigentum, Zugriff und Moderationsrechte durchsetzen. Gleiches gilt für Freigaben, Meldungen und Minderjährigenschutz. Echte Kommunikation braucht gemeinsame Speicherung, geprüfte Zugriffsrechte und einen betreuten Moderationsprozess; ein Echtzeitkanal allein reicht dafür nicht aus.

## Benötigte Informationen vom zweiten Team

1. Aktueller Branch/Code und eine Liste der bereits funktionierenden Supabase-Abläufe; Schema und vorhandene Migrationen, ohne Geheimnisse oder Service-Role-Schlüssel.
2. Profil-/Auth-Zuordnung, ID-Typen, Schulbeziehungen, Rollenmodell und serverseitige Zugriffsregeln; Umgang mit Minderjährigen, Freigaben und Verantwortlichen.
3. Modelle und Statuswerte für Events, Teilnahme, Projekte, Mitwirkung, Nachhilfe, Vormerkungen, Beiträge und Meldungen; vorhandene Tabellen müssen vor Ergänzungen abgeglichen werden.
4. Vorhandene Service-/Hook-Schnittstellen, Lade- und Fehlerformate, Versions-/Konfliktprüfung, Echtzeitabonnements und Testverfahren.
5. Umgang mit mehrsprachigen Inhalten, Demo-Daten, Entwürfen, Löschungen, Sicherungen, Moderation und Aufbewahrung; welche Daten sollen überhaupt übernommen werden.
6. Routing, Komponentenstruktur, CSS-Konventionen, Paketversionen und geplante Reihenfolge der Zusammenführung.

## Erwartbare Konflikte und nächste Schritte

Lokale String-IDs können mit Auth-IDs/UUIDs kollidieren. Teilnehmerlisten als Arrays und Maps passen möglicherweise nicht zu den Beziehungen der zweiten Version. Eigener Planungsstand, administrative Freigabe und Offen-/Geschlossen-Zustand dürfen nicht zu einem mehrdeutigen Status vermischt werden. Demo-Auswahl darf keine zweite Authentifizierung werden. Lokal gespeicherte Meldungen dürfen beim Merge nicht plötzlich als zugestellte Meldungen erscheinen.

Weitere Konfliktstellen sind Hash-Routing gegenüber einem Router, Sprachzustand und Profilpräferenzen, übersetzte Seeds gegenüber Datenbankinhalten, zwei parallele Context-/Service-Strukturen, CSS-Selektoren und unterschiedliche Löschregeln. Ein globaler Browser-Snapshot darf kein Ersatz für serverseitige Berechtigungen sein.

Empfohlene Reihenfolge: beide Stände sichern und vergleichen; Daten- und Rollenvertrag gemeinsam beschließen; IDs und Status abbilden; einen vertikalen Ablauf wie Nachhilfe-Liste → Details → eigener Eintrag → Bearbeiten anbinden; danach Personalisierung und übrige Module schrittweise integrieren. Lokale Demo-Daten nur nach ausdrücklicher Entscheidung und validiert übernehmen. Anschließend Berechtigungs-, Mehrbenutzer-, Konflikt- und Mobiltests mit beiden Teams durchführen. Noch wurden keine Supabase-Abhängigkeit, SQL-Tabelle, Konten oder Netzwerkzugriffe ergänzt.
