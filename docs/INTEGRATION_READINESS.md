# Integrationsbereitschaft der Nutzeranwendung

Stand: 8. November 2026, Branch `codex-version-1.0`, Ausgangs-HEAD `889ad1b`. Eges Implementierung bleibt ungeprüft und unverändert. Der bestehende dunkle Entwurf, alle Module und DE/TR/EN bleiben erhalten. Kein neues Admin-Modul, keine neue Abhängigkeit, kein Schemawechsel und kein Deployment in diesem Auftrag.

## 1. Bereits zuverlässig funktionierende Nutzerabläufe

„Lokal im Browser geprüft“ bedeutet hier: echte React-Oberfläche, unabhängige Kontositzungen A/ERS, B/Anka und bei Bedarf C/Moderation, echte HTTP-Aufrufe an denselben Handler wie in der Edge Function; **Auth-Anbieter und SQL-Speicher werden simuliert**. Das ist mehr als eine Renderprüfung, aber keine Live-Abnahme mit Supabase-Konten oder echter Hardware.

| Modul | Nachgewiesener Ablauf | Abgrenzung |
| --- | --- | --- |
| Projekte | A veröffentlicht, Reload/Meine Projekte; B findet und fragt an; A empfängt, lehnt ab und akzeptiert die erneute Anfrage; beide sehen denselben Status; Bearbeitung, fremde Löschung verweigert | Keine administrative Projektfreigabe; Planungsstand ist keine Genehmigung |
| Nachhilfe | A veröffentlicht, B findet Angebot, privater Entwurf bleibt nach Reload; A bearbeitet/schließt; fremdes Schließen abgewiesen | Kontaktentwurf und Vormerkung werden **nicht** an A zugestellt; keine Antwortmöglichkeit |
| Events | Vorschlag A → sichtbar nur für Berechtigte → Freigabe C → Anmeldung B → Reload/Meine Aktivitäten → Rücknahme | Registrierung ist kein Anwesenheitsbeweis; positive/negative Nachweisregeln zusätzlich in Modelltests |
| Community | Mitglieder treten bei, A sendet, B erhält über App-Poll und nach Reload; verlorene Antwort erneut senden ohne zweite Nachricht; Meldung bei C sichtbar und bearbeitbar; nach Austritt kein Inhalt/Schreibrecht | Echte Zuständigkeit und Betreuung müssen organisatorisch sichergestellt werden |
| Profile/Statistiken | Aus gespeichertem Projekt berechnete Aktivitätszahl, Name/Interessen nach Reload; optionale Felder vor Freigabe verborgen, danach gezielt sichtbar; keine öffentliche E-Mail | Rollen und Freigaben werden serverseitig projiziert; öffentliche Zahlen sind kein Zugriff auf private Aktivität |
| Schach | Einladung erreicht B auf bereits geöffneter anderer Seite; Annahme erzeugt dieselbe Partie; abwechselnde Züge, Matt, Reload, genau ein gewerteter Sieg; fremder Manipulationsversuch abgewiesen | Nur In-App, kein externer Mail-/Push-Versand. Hotseat ist Übung |
| Spiele/Bestenlisten | Alle vier Spiele und alle drei Kategorien in DE/TR/EN; vollständige Symbolpaare-Runde, beendete Arcade-Runden, persönliche Historie nach Reload, freiwillige Demo-Freigabe | Konto-Arcade-Ergebnisse bleiben gerätelokal; echte Global-/Schulranglisten fehlen |
| Konto | Registrierung und kontrolliert simulierte Bestätigung, Login/Reload/Logout, fehlerhafte Zugangsdaten; Netzfehler gegenüber widerrufener Sitzung unterschieden | Keine tatsächliche E-Mail-Zustellung oder neue Live-Registrierung in diesem Auftrag |

Die zuletzt freigegebene Function `platform` Version 3 bleibt unverändert. Die aktuelle öffentliche Live-Probe bestätigt sieben erwartete HTTP-Ergebnisse: Auth/Preflight erreichbar, anonym/gefälscht abgewiesen, falsche Origin abgewiesen und private Tabellen nicht öffentlich lesbar. Eine authentifizierte Zwei-Nutzer-Abnahme fehlt weiterhin; der dafür vorbereitete Live-Smoke wurde wegen fehlender dedizierter bestätigter Testzugänge ausdrücklich übersprungen.

## 2. Demonstrationen und unvollständige Funktionen

- Gastprofile und deren modulübergreifende Aktivitäten sind fiktive lokale Demonstration. Sie sind keine angemeldeten Schüler und werden nicht zu echten Konten hochgestuft.
- Globale/Schul-Spielranglisten sind lokale freiwillige Demo. Bei Konten wird der fehlende gemeinsame Ranglistendienst erklärt; beliebige Browser-Scores werden nicht als bestätigte Online-Leistung hochgeladen.
- Die drei Einzelspielrekorde sind auch bei Konten nur gerätelokal. Persönliche Kontoschachpartien kommen dagegen über die gemeinsame Serverschnittstelle.
- Nachhilfe-Kontakt bleibt privater Entwurf. Die vorhandene Bestätigung sagt ausdrücklich „nicht versendet“. Ein vollständiger Zustell-/Antwortablauf wäre ein gesonderter Funktionsvertrag, keine kleine Änderung der Beschriftung.
- Externe Einladungs-E-Mails/Push fehlen; Mailvorlagen sind vorbereitet. Bei geschlossener Website gibt es derzeit keinen externen Hinweis.
- Interviews, Initiativen und Vorschlagsformate sind kein Beleg bereits durchgeführter schulübergreifender Aktivitäten. Keine Erfolgszahlen daraus ableiten.

## 3. Gezielte Verbesserungen und verbleibende Grenzen

### In diesem Auftrag korrigiert

1. **Anmeldeaktionen:** Modi sind während einer laufenden Anfrage gesperrt, ebenso mehrfaches Absenden/Abmelden. Ein Mailhinweis verschwindet bei Modus- oder Adresswechsel. Ungültige Felder erhalten passende Texte, `aria-invalid`, zugeordnete Fehler und Fokus; Login verlangt keine nicht vorhandenen Registrierungsfelder.
2. **Eventformular:** Feldbezogene Prüfung von Titel, Beschreibung, Datum und Schule; Fokus auf dem ersten Fehler; separate Speichermeldung statt angeblicher Eingabeprobleme bei Netzfehler. Sichtbarer Ladezustand/`aria-busy`, stabile Anlage-ID, Eingabe/Entwurf nach Fehler und Reload erhalten. Ohne Profilschule wird keine veranstaltende Schule stillschweigend angenommen.
3. **Aktualisierung:** Manuelle Wiederholung und gleichzeitiger Hintergrund-Poll derselben Kontositzung teilen eine laufende Anfrage. Der Wiederholungsbutton zeigt den Ladezustand und ist gesperrt. Unveränderte Nutzersichten erzeugen keine erneute State-Übernahme; veränderte Rollen-/Fähigkeitsprojektionen gleicher Revision werden weiterhin berücksichtigt.
4. **Gruppenrechte:** Moderations-Leserecht wird nicht als Mitgliedschaft behandelt. Beitreten/Verlassen und Schreibformular richten sich nach tatsächlicher Mitgliedschaft, während die vorhandenen Serverprüfungen unverändert bleiben.
5. **Widerrufene Sitzung:** Ein normaler Plattform-Poll, der 401 oder fehlende Bestätigung erhält, verwirft jetzt die zugehörige Sitzung und Identität. Ein neueres Konto wird durch eine verspätete alte Antwort nicht abgemeldet. Vorübergehende Netzfehler löschen den zuletzt geladenen eigenen Stand nicht.
6. **Route nach Anmeldung/Sprachwechsel:** Ein im Mobil-Lauf nachgewiesenes Timingproblem konnte trotz geänderter URL die alte Kontoseite anzeigen. Die erste Routenanmeldung synchronisiert jetzt den aktuellen Hash. Sprachwechsel verwenden denselben Listener mit aktuellem Warntext, statt ihn kurzzeitig abzuhängen. Eine zunächst rote History-Regressionsprüfung und ein eigener Browserfall sichern den Übergang ab.

Zunächst rote Regressionen belegten die Modus-/Lade-/Fokusprobleme und die nicht verworfene widerrufene Sitzung. Der zusätzliche Rollen-Browserfall deckte auch die fälschlich angebotene Aktion „Gruppe verlassen“ für bloß lesende Moderation auf. Korrekturen wurden jeweils erneut geprüft.

### Noch offen

- Live-Mehrnutzerbetrieb mit zwei kontrollierten bestätigten Konten und später zwei echten Geräten. Lokale Tests allein geben dafür keine Freigabe.
- Nachhilfezustellung/Antwort, externe Benachrichtigungen und verifizierte gemeinsame Ranglisten sind weiterhin nicht implementiert. Keine neuen großen Funktionen hierfür angelegt.
- Adminseitige Pflichtrevisionen, Freigabe-/Änderungsaudit, schulbezogene Rollen, Absage-/Widerrufsprozesse und Lösch-/Aufbewahrungsregeln müssen mit Ege abgestimmt werden. Bestehende Endpunkte nicht umdeuten; Details und konkrete Lücken im [Admin-Vertrag](ADMIN_INTEGRATION_CONTRACT.md).
- Projektlöschung/Zurückziehen kann derzeit auch bestätigte Abschlusszahlen aus der Anzeige nehmen. Eventabsagen und historische Anerkennungen brauchen einen gemeinsamen Korrekturvertrag. Nicht durch direkte Statistikänderungen kaschieren.
- Globale Moderation ist für den Pilot vorbereitet, aber kein nachweislich personell betreuter, schulbezogener Betriebsprozess. Keine automatische Ausweitung der Rollen vorgenommen.
- Fester Vier-Sekunden-Poll bei sichtbarer App überträgt weiterhin die vollständige erlaubte Nutzersicht. Beide Identitätsprüfungen sind bewusst erhalten: Clientprüfung verhindert Ausführung eines alten Auftrags unter einem anderen Konto; der Server muss unabhängig prüfen. Last/Netzverbrauch auf realen Mobilgeräten nicht gemessen.
- Das Hauptbundle bleibt über 500 kB. Das ist eine bekannte Performancegrenze; gezieltes Lazy Loading/Sprachpaket-Laden, inkrementelle Abfragen und Pagination sind Vorschläge für die spätere Integration, keine unangekündigte Neustrukturierung.

## 4. Vorbereitete Schnittstellen zum Admin-Modul

[ADMIN_INTEGRATION_CONTRACT.md](ADMIN_INTEGRATION_CONTRACT.md) beschreibt pro Aktion Auslöser, Rolle, Daten, Statusübergang, aktuelle Serverprüfung, Nutzerauswirkung und offene Entscheidungen F1–F12. Er umfasst Projekte/Freigaben, Events/Teilnahmebelege, Meldungen, Inhaltsmoderation, Blockierung/Rollen, Nachhilfe, Profile, Schach und Statistikfolgen.

Vorhandene technische Grenzen bleiben nutzbar:

- `src/services/supabase.js`: Auth/Tokenprüfung und versioniertes Plattformprotokoll mit bestätigter Revision.
- `AccountContext`: kontogebundene Mutationswarteschlange, stabile Befehls-ID bei unklar beantworteten Aufträgen, veraltete Antworten verwerfen, koordiniertes Reload.
- `platformHandler.js`: gemeinsame HTTP-/Rollen-/Projektionsgrenze von Produktion und lokaler Integrationstestumgebung.
- `applyPlatformAction` / `projectPlatform`: fachliche Befehle gegenüber zulässiger Lesesicht; kein ungefilterter Workspace im Browser.
- Reine Selektoren für persönliche/öffentliche Statistiken: Mitglieder, Nachweise und Freigaben statt separat geschriebener Zähler.
- Playwright-Simulator: separate Kontokontexte, HTTP-Speicherung und Rollenfälle austauschbar; Live-Smoke strikt getrennt und optional.

Es wurden keine leeren Admin-Adapter oder fiktiven Backend-Endpunkte ergänzt. Die vorhandene kleine Moderationsansicht wurde nicht erweitert.

## 5. Mögliche Datenbankkonflikte bei der Integration

| Unser Istzustand | Abgleich mit Ege erforderlich | Bei falscher Übernahme droht |
| --- | --- | --- |
| JSONB-Workspace plus atomarer Commit und globale Revision | Seine tatsächliche Speicherung, Schreibautorität und Transaktions-/Konfliktregeln | Verlorene Änderungen durch zwei unabhängige Vollsnapshot-Schreiber |
| Auth-UUID als Profil-ID, getrennte `local-…`-Objekt-IDs | Auth-Quelle, bestehende IDs und Referenzen | Fremde Eigentümerschaft, doppelte Konten, kaputte Gruppen/Einladungen |
| `ers`/`anka` als Pilot-Schulschlüssel, Schule Selbstauskunft | Verifizierte Schulmitgliedschaft und Katalogadapter | Falsche Rechte/Schulstatistiken; gleiche Namen sind keine sichere Zuordnung |
| Projektplanung, Lebenszyklus und bestätigter Abschluss getrennt; keine Projektfreigabe | Freigabemodell und Verhalten für vorhandene Inhalte | Projektideen verschwinden oder werden versehentlich als genehmigte Aktivität angezeigt |
| Event proposal/confirmed, eigene Map-Anmeldung, gesonderter Anwesenheitsbeleg | Absage, Kapazität, Bestätigung, Aufbewahrung und Widerruf | Anmeldung als Teilnahme gezählt, verwaiste oder doppelte Anerkennung |
| Freiwillige Verzeichnissichtbarkeit plus einzelne Feldfreigaben | Zustimmung und Fähigkeitssignale, Default für alte Datensätze | Unbeabsichtigte Veröffentlichung optionaler Aktivitäten |
| Themenmitgliedschaften bzw. aus Kontext abgeleitete Gruppenrechte | Gruppenrollen, Leserecht/Schreibrecht und Moderationszuständigkeit | Zugriff auf fremde Räume oder unbenutzbare Beitragsformulare |
| Private Entwürfe, persönliche Vormerkungen, Meldungen mit Zieltyp | Zustellung/Benachrichtigung, zusammengesetzte Schlüssel und Moderationsverantwortung | Entwurf wird fälschlich als Nachricht zugestellt oder Meldung falsch zugeordnet |
| Aus Quelle berechnete Statistiken, keine unabhängigen Totals | Gemeinsam definierte Metriken und bestätigte Datenquellen | Interesse/Anmeldung als Leistung gezählt oder doppelte Zähler |

Eges Seite ist in dieser Tabelle bewusst nicht erfunden. Erst ein tatsächlicher Schema-/Codevergleich kann eine konkrete Migration oder einen Adapter begründen.

## 6. Empfohlene Zusammenführung

1. Beide Branches/Modelle lesend vergleichen und für jede Abweichung den Vertrag entscheiden. Keine produktiven personenbezogenen Daten für den Vergleich kopieren.
2. Eine gemeinsame Identitäts- und Schreibautorität festlegen; Rechte, Objekt-IDs und Status ausdrücklich mappen. Gastdaten vollständig getrennt lassen.
3. Zunächst nur einen vertikalen Ablauf verbinden: A erstellt Projekt, B fragt an, A entscheidet, C darf nur vereinbarte Moderationshandlungen durchführen. Eigentumsgrenzen und Schulzuständigkeit positiv/negativ prüfen.
4. Anschließend Eventfreigabe/Anmeldung/Beleg und Meldungsbearbeitung anbinden; Nutzersichten/Statistiken aus dem gemeinsamen bestätigten Zustand prüfen.
5. Vorgeschlagene größere Änderungen (normalisierte Tabellen, zusätzliche Rollen, Pflichtrevisionen, Audit, bedarfsabhängige Datenabfragen) in isolierter Testumgebung implementieren. Migration, Backfill, Rollback und Deployment separat genehmigen lassen.
6. Unit-/HTTP-/Render-/Browserregressionen gegen den gemeinsamen Dienst wiederholen. Erst nach kontrolliertem Live-Lauf und tatsächlicher Zwei-Geräte-Prüfung die jeweilige Fähigkeit als live abgenommen dokumentieren.

## 7. Vor dem öffentlichen Beta-Test

- Zwei dedizierte bestätigte Testkonten und eine genehmigte erreichbare HTTPS-Testadresse samt erlaubten Origins/Redirects. Zugangsdaten ausschließlich lokal/geschützt, keine Schülerkonten oder Betreiberpasswörter als Fixture.
- Projektanfrage, Eventfreigabe, gemeinsame Nachricht/Meldung und Schachpartie auf zwei tatsächlichen Geräten vollständig abnehmen, inklusive Verbindungsabbruch und Reload. [Konkrete Anleitung](END_TO_END_AUDIT.md#7-live-abnahme-vorbereiten-und-auf-zwei-geräten-prüfen).
- Moderationszuständigkeit, eingeschränkte Rollen, Bearbeitungsprozess und gemeinsame Entscheidungen aus dem Admin-Vertrag vor Aktivierung der entsprechenden Eingriffe festlegen.
- Freigabedefaults, serverseitige negative Rechteprüfungen, Sitzungs-/Rollenentzug, Datenlöschung/Aufbewahrung und Backups an der integrierten Version prüfen. Keine alleinige Frontend-Zugriffssicherheit.
- Nicht vorhandene Zustellung, Mail/Push und gemeinsame Ranglisten weiterhin klar kennzeichnen; keine fiktiven Erfolgszahlen veröffentlichen.
- Netzwerk-/Bundleverhalten und Keyboard/Touch auf realen schwächeren Mobilgeräten und den vorgesehenen Browsern prüfen. Aktuelle Emulation ist kein Hardwarebenchmark und keine vollständige Accessibility-Zertifizierung.

## Prüfung dieses Auftrags

- Unit-/HTTP-Integration: **138 erfolgreich**, einschließlich neuer Regressionen zu Widerruf während normalem Polling und Hashwechsel vor Listeneranmeldung.
- Browser: **42/42 erfolgreich**, davon 21 Desktop und 21 Pixel-7-Emulation, keine Wiederholungen oder verbleibenden Fehler. Eine vorherige Folgerunde hatte einen seltenen Routingfehler aufgedeckt; dieser wurde mit zunächst rotem Regressionstest korrigiert und im letzten vollständigen Lauf einschließlich neuem Sprach-/Navigationsfall erneut geprüft.
- DE/TR/EN: **802 Texte je Sprache**, Schlüssel und Kodierung gültig.
- Render-/Linkprüfung: 87 Routen je Demo-Profil/Sprache plus Konto-/Profil-/Nachrichten-/Spielezustände erfolgreich.
- Produktions-Build erfolgreich: 130 Module, JavaScript 550,86 kB / gzip 169,29 kB; bestehende nicht blockierende Bundlewarnung über 500 kB bleibt. Offline-Prüfung mit fünf tatsächlich gebauten Ressourcen erfolgreich, API-/private Anfragen ausgeschlossen.
- Öffentliche Live-Probe: sieben erwartete HTTP-Ergebnisse erfolgreich. Live-Schreibtest: **ein Test mangels bestätigter dedizierter Zugänge übersprungen**, kein Live-Erfolg.
- CSS-Kontrast rechnerisch geprüft: normaler Text/Karte 14,54:1; Hilfstext/Karte 7,46:1; Fehlertext/Karte 10,01:1; primärer Buttontext/Blau 5,05:1. Zentraler Fokusindikator und 44/46-px-Bedienelemente erhalten. Das ist keine vollständige Prüfung jeder dynamischen Farbkombination.

Geänderte Implementierung: `src/pages/{Account,EventNew,Community}.jsx`, `src/App.jsx`, `src/components/AccountStatus.jsx`, `src/state/{AccountContext.jsx,routeHistory.js}`, `src/services/supabase.js`, sechs Sprachdateien unter `locales/platform` und `locales/quality`. Prüfungen: `tests/e2e/{backend,local.spec}.js`, `scripts/server-confirmation.test.mjs`, `scripts/route-history.test.mjs`. Dokumente: dieser Bericht, Admin-Vertrag, README, aktuelle Übergabe und Querverweis im bestehenden E2E-Bericht. Vorbestehende uncommittete Dokumentationsänderungen zur früher genehmigten Bereitstellung wurden erhalten. Keine eigenen Commits, Pushes, neuen Deployments oder Migrationen.
