# End-to-End-Audit und Mehrnutzerfähigkeit

Stand: 8. November 2026. Branch `codex-version-1.0`, Ausgangs-HEAD `fee4c13`.

## Belastbare Antwort auf die Kernfrage

**Zwei unabhängige Schüler sind noch nicht mit dem aktuellen Cloudstand durchgängig live abgenommen.** Das Supabase-Testprojekt ist tatsächlich erreichbar, besitzt die Migration und eine aktive Function. Lokale Browsertests belegen inzwischen vollständige Abläufe zwischen voneinander unabhängigen Kontositzungen: Projekte veröffentlichen und anfragen, Anfragen annehmen/ablehnen, Events freigeben und sich anmelden, Gruppenbeiträge austauschen und eine gemeinsame Schachpartie spielen.

Diese Browsernachweise verwenden den echten React-Code und denselben HTTP-Handler wie die Edge Function, aber simulierte Authentifizierung und Datenbankzugriffe. Sie belegen **keinen** tatsächlichen Supabase-Schreibvorgang und keinen Zwei-Geräte-Betrieb. Ohne zwei kontrollierte bestätigte Testzugänge und Bereitstellung des aktuellen geprüften Function-Stands bleiben die Live-Abnahme sowie echte Registrierungs-/Mailtests blockiert.

Nachhilfe vermittelt derzeit Angebote und speichert private Kontaktentwürfe bzw. Vormerkungen. **Es gibt keine Zustellung dieser Kontaktanfrage an den Anbieter und keinen Antwortkanal.** Der Text „nicht versendet“ ist korrekt; der gewünschte vollständige Kontaktablauf ist noch unvollständig. Echte gemeinsame Arcade-Ranglisten und externe Schacheinladungs-E-Mails sind ebenfalls nicht implementiert.

## 1. Aktueller Backend-Status: tatsächlich geprüft

Alle externen Prüfungen waren lesend bzw. abgewiesene unautorisierte Testaufrufe und richteten sich ausdrücklich nur an **DeutschConnect - Codex Demo**, Projekt `gdwxitcwtzkyfspjfoiw`. Keine produktiven Schülerkonten, Benutzerlisten, privaten Datensätze oder Geheimschlüssel ausgegeben. Keine Migration, Function-Bereitstellung, externe Konfigurationsänderung oder Änderung an Eges Projekt.

| Prüfung / Soll | Beobachtet am 8. November 2026 | Einordnung |
| --- | --- | --- |
| Frontend-Konfiguration zum richtigen Projekt | Gültige ignorierte `.env.local`, erwarteter Host; Probe verweigert andere Hosts | LIVE geprüft, keine Werte protokolliert |
| Auth erreichbar, E-Mail aktiviert | `/auth/v1/settings` HTTP 200; E-Mail an, Signup erlaubt, automatische Bestätigung aus | LIVE geprüft; keine tatsächliche Anmeldung/Bestätigung in dieser Sitzung |
| Function erreichbar und bereitgestellt | Metadaten: `platform`, ACTIVE, Version 2, `verify_jwt=false`; Preflight HTTP 200 | LIVE geprüft. Eigene `/user`-Prüfung bleibt nötig und ist im Handler vorhanden |
| Anonyme/gefälschte Aufrufe abweisen | Je HTTP 401; unzulässige Origin HTTP 403 | LIVE geprüft |
| Migration vorhanden | `202611070001` in der entfernten Migrationshistorie | LIVE lesend geprüft, nicht neu angewendet |
| Datenbank erreichbar | Explizite `--read-only`-SQL-Abfragen erfolgreich; ein Workspace vorhanden | LIVE geprüft. Kein neuer fachlicher Schreibvorgang nachgewiesen |
| Workspace/Befehlsprotokoll privat | RLS auf beiden Tabellen; anon darf Snapshot nicht lesen; authenticated darf Snapshot nicht lesen/ändern und Befehlsprotokoll nicht lesen | LIVE lesend geprüft; direkte öffentliche REST-Aufrufe zusätzlich HTTP 401 / SQLSTATE 42501 |
| Privilegierter Commit beschränkt | authenticated darf `dc_commit` nicht ausführen, service_role darf; Funktionsdefinition enthält Sperre und Revision | LIVE lesend geprüft; reale konkurrierende Schreiblast nicht getestet |
| Aktuellen lokalen Stand bereitstellen | Nicht ausgeführt. Lokale Profil-/Benachrichtigungs-/Auditänderungen samt neuem Handler sind neuer als die frühere Bereitstellung | Externe Freigabe nötig |
| E-Mail tatsächlich zustellen | Nicht ausprobiert. Bisher kein eigener Versanddienst eingerichtet; keine zwei freigegebenen bestätigten Testzugänge verfügbar | BLOCKIERT / NICHT GETESTET |

Wiederholbare öffentliche Prüfung: `npm.cmd run check:backend:live`. Ergänzende lesende Schema-/Rechteprüfung: `scripts/e2e-live-readonly.sql`, mit dem expliziten Ziel und `--read-only` ausführen. Sie enthält keine Nutzerdatenabfrage und keine Migration. Eine erfolgreiche öffentliche Probe alleine ist kein Beweis für erfolgreiche Fachaktionen.

## 2. Testumgebungen und Trennung

### Lokaler Browserlauf

- Playwright/Chromium, Desktop Chrome und Pixel-7-Emulation. Normale Klicks, Eingaben, Navigation, Reload; bei den mobilen Arcade-Smokes zusätzlich echte emulierte Touch-Eingaben. Keine neue App-Abhängigkeit; Playwright ist nur Entwicklungsabhängigkeit.
- Vite unter `127.0.0.1:4180`, isolierter HTTP-Simulator unter `127.0.0.1:4181`.
- Drei fiktive Konten A/ERS, B/Anka Bilim und C/Moderation; eigene Zugangsdatenprüfung, Tokens und je eigener BrowserContext mit getrenntem Local-/SessionStorage. Kein Umschalten zwischen Demo-Personas als Ersatz für Login.
- Produktionscode: `src/services/supabase.js`, AccountContext, React-Oberfläche und `createPlatformHandler` einschließlich serverseitiger Befehlsprüfung und Benutzerprojektion.
- Simuliert: Auth-Anbieter einschließlich Bestätigung, PostgREST und atomarer Commit/Befehlsprotokollspeicher. **Keine PostgreSQL-/Deno-Integration.** Simulierte Bestätigung bedeutet keine versandte Mail.
- Der lokale Adapter besitzt keinen externen Datenbankzugriff. HTTPS-Anfragen der Testbrowser werden zusätzlich blockiert. Der Test-Vite erhält ausdrücklich lokale Konfiguration.
- Jeder Test beginnt mit frischen fiktiven Daten; Sitzungen und Server werden geschlossen. Keine Testdatensätze gelangen in die Cloud. Screenshots und JSON-Ergebnisse liegen ausschließlich im ignorierten `test-results/`.

Die Verwendung unabhängiger BrowserContexts und des lokalen Webservers folgt der [Playwright-Isolation](https://playwright.dev/docs/browser-contexts) und [Webserver-Konfiguration](https://playwright.dev/docs/test-webserver).

### Getrennter Live-Lauf

`npm.cmd run test:e2e:live` verwendet die eigene Supabase-Konfiguration und Port 4173, der bereits zu den dokumentierten lokalen Origins gehört. Er benötigt ausdrücklich dedizierte, bestätigte Testkonten und das Opt-in `DC_E2E_TEST_ACCOUNTS_ONLY=1`. Er prüft Zielprojekt, unterschiedliche Identitäten, fehlende Moderatorrolle, Profilnamen mit Präfix `E2E TEST`, Deutsch und die Schulen ERS/Anka vor der ersten Anlage.

Vorbereiteter Live-Smoke: Projektanlage → Reload → Auffinden durch B → Anfrage → Annahme → Mitgliedschaft nach Reload → verweigerte fremde Löschung. Eigene Testprojekte erhalten eindeutige IDs und werden im `finally` über die normale Eigentümeraktion entfernt (bestehende Löschmarkierung, keine harte Datenbanklöschung). Cleanupfehler werden gemeldet; Kontexte schließen auch dann. Keine Mailboxautomation oder Umgehung der Bestätigung. Keine gespeicherten Loginzustände, Traces, Videos oder Screenshots im Live-Modus.

**Beobachtetes Ergebnis dieses Auftrags:** Live-Smoke ausdrücklich **übersprungen**, weil die dedizierten bestätigten Testzugänge fehlen. Das ist kein erfolgreicher Live-Test. Weitere Live-Module sind durch die untenstehende manuelle Abnahme beschrieben; sie werden nicht als bereits automatisiert live getestet ausgegeben.

## 3. Funktionsnachweise

In der Tabelle bedeutet „lokaler Browser“ die oben exakt beschriebene Umgebung mit simuliertem Auth/SQL. „Modelltest“ ist ein vorhandener automatisierter JavaScript-Test ohne Benutzeroberfläche. Erwartung und tatsächlich beobachteter Zustand sind getrennt angegeben.

| Funktion und getesteter Ablauf | Erwartung | Tatsächlich beobachtet / Methode | Ergebnis und Live-Grenze |
| --- | --- | --- | --- |
| Registrierung → Bestätigung → Login → Reload → Logout | Erst bestätigte Identität, Profil dauerhaft, danach Gastmodus | Lokaler Browser: Registrierung mit fiktiver Adresse, kontrolliert simulierte Bestätigung, Profil im gemeinsamen Testzustand, Sitzung nach Reload, Rückkehr zur Gastpersona | Lokal erfolgreich; echte Bestätigungsmail und heutiger Supabase-Login NICHT GETESTET |
| Ungültige Zugangsdaten / abgelaufene Sitzung | Verständlicher Fehler bzw. sichere Abmeldung | Lokaler Browser zeigt Fehler, abgewiesene Sitzung verliert Kontoansicht; Gastspiele bleiben erreichbar. Mock-HTTP-Tests prüfen zusätzlich abgelaufene Links und Refresh-/Kontowechsel | Lokal erfolgreich; echte Token-Langzeitprüfung offen |
| Projekt veröffentlichen / Meine Projekte / Reload | Erst nach Serverantwort Detailseite; Datensatz auch für B sichtbar | A legt über Formular an, Reload/„Meine Projekte“, B entdeckt in Übersicht und öffnet | Lokaler Browser erfolgreich; Supabase-Schreibtest BLOCKIERT |
| Anfrage → Ablehnung → erneute Anfrage → Annahme | Nur Empfänger A bearbeitet; Ablehnung keine Mitgliedschaft; beide sehen Annahme | Lokaler Browser: A sieht Test B im Anfragebereich, lehnt ab, nimmt zweite Anfrage an; B sieht „Projekt verlassen“, gemeinsamer Testdatensatz enthält genau B | Lokal erfolgreich |
| Bearbeiten / Eigentum / alte Revision | Besitzer kann ändern, Fremder nicht löschen; Konflikt verwirft keine neuere Änderung | A bearbeitet, B sieht neuen Titel; direkte fremde API-Löschung HTTP 400. Zwei gleichzeitige HTTP-Edits derselben Revision ergeben 200 und 409; zwei identische Befehle erzeugen einen Datensatz | Lokal erfolgreich; atomarer SQL-Commit separat lesend geprüft, nicht mit echter konkurrierender Last |
| Event erstellen → prüfen → freigeben → anmelden → Reload → zurücknehmen | Unfreigegebenes Event für B unsichtbar; Moderator entscheidet; genau eine Anmeldung | Lokaler Browser mit A/B/C: Entwurf nicht für B sichtbar, unzulässige Anmeldung abgewiesen, C gibt frei, B meldet sich an, Reload zeigt Anmeldung, „Meine Events“, anschließende Rücknahme | Lokal erfolgreich; tatsächlicher Moderatorprozess nicht live abgenommen |
| Anmeldung gegenüber Anwesenheit/Auszeichnung | Registrierung ist kein Teilnahmenachweis | Browser prüft ausdrücklich fehlenden Anwesenheitseintrag nach Anmeldung. Modelltests prüfen positive/negative organisatorische Bestätigung, Zeitpunkt, Doppelzählung und Auszeichnungen | Erfolgreich auf jeweils genannter Ebene; keine realen Teilnahmen erzeugt oder bestätigt |
| Nachhilfe veröffentlichen / finden / bearbeiten / schließen | Berechtigte sehen Angebot; Besitzer kann verwalten | Lokaler Browser: A legt Angebot an, B findet es; A bearbeitet/schließt, B sieht keinen aktiven Kontakteditor; fremdes Schließen HTTP 400 | Lokal erfolgreich |
| Nachhilfe-Kontakt / Interessen | Empfänger darf erst bei echter Zustellung als benachrichtigt gelten | B speichert Entwurf, UI sagt „nicht versendet“; Reload erhält ihn, A erhält ihn ausdrücklich nicht. Interesse ist eine private Vormerkung | Privater Entwurf funktioniert; Zustellung/Antwort NICHT IMPLEMENTIERT, kein vollständiger Kontaktablauf |
| Gruppe beitreten → Beitrag → zweiter Browser → Reload | Mitglieder erhalten denselben gespeicherten Beitrag | Lokaler Browser: A/B treten bei; B sieht As Nachricht über den tatsächlichen 4-Sekunden-App-Poll und nach Reload. Nach verlorener Antwort erneutes Senden ergibt genau eine Nachricht | Lokal erfolgreich; kein Cloud-Beitragslauf |
| Gruppe verlassen / privater Raum | Danach kein Inhalt und kein Schreibrecht | Nach bestätigtem Austritt liefert direkte API keine Gruppenbeiträge; Schreiben HTTP 400. Privater Projektraum ohne Mitgliedschaft ebenfalls abgewiesen | Lokal erfolgreich, einschließlich serverseitiger Projektion |
| Meldung → Moderation → geprüft | Meldung erreicht zuständige Sicht | B meldet Beitrag, C sieht denselben Text in Moderation und markiert ihn geprüft; Backend-Testzustand aktualisiert | Lokal erfolgreich; tatsächliche Zuständigkeit/Bearbeitung organisatorisch offen |
| Blockierung | Inhalte/Einladungen in beiden Richtungen eingeschränkt | Direkte HTTP-Aktion blockiert A für B; Bs Projektsicht entfernt A, neue Herausforderung wird serverseitig abgewiesen | Lokal erfolgreich; kein bloß versteckter Button |
| Schacheinladung an bereits offene Website | Empfänger wird ohne Personawechsel benachrichtigt | A lädt B ein; B bleibt auf Nachhilfe, Glocke erscheint durch App-Poll. Annehmen verbindet beide mit derselben Partie-ID | Lokaler Browser erfolgreich; In-App, keine Mail/Push-Zustellung |
| Gemeinsames Schach → Züge → Matt → Reload | Beide sehen denselben Zugstand; ein korrektes Ergebnis | A/B spielen über Brettfelder die vier Züge von Fool’s Mate, Reload erhält sie, genau eine Partie und ein schwarzer Sieg. Bs persönliche Ansicht zeigt einen Sieg | Lokal erfolgreich; kein echtes Online-Spiel über Supabase oder zwei Geräte |
| Fremde/ungültige Schachaktion | Keine Manipulation | C erhält keine fremde Partie in seiner API-Sicht und darf keinen Zug schicken; Modelltests prüfen illegale Züge, Revision, Abbruch, Remis und Doppelwertung | Erfolgreich auf jeweils genannter Ebene |
| Symbol Pairs | Vollständiger Abschluss genau einmal gespeichert | Karten über sichtbare Knöpfe aufgedeckt und gelöst, danach persönliche Punktzahl 1 und genau ein Historieneintrag nach Reload | Lokaler Browser erfolgreich |
| Paper Flight / Bridge Runner | Beendeten Durchgang speichern; Maximum statt Summe | Beide Spiele über reguläre Steuerung gestartet und beendet, Historie nach Reload, freiwillige Freigabe und eigene Demozeile. Modelltests vergleichen mehrere Scores und prüfen Maximalwert/Schwierigkeit/Neustart | Browser + Modelltests erfolgreich; neue Arcade-Ergebnisse gerätelokal |
| Drei Ranglisten je Spiel / alle Sprachen | Jede Kategorie erreichbar, keine erfundenen Onlinewerte | DE/TR/EN im Browser: alle vier Spiele × drei Kategorien; zusätzliche Renderprüfung als Demo/Konto; Kontoansichten erklären fehlende gemeinsame Daten | Demo erfolgreich; echte globale/Schulranglisten NICHT IMPLEMENTIERT |
| Persönlicher Bereich / Profilfreigabe | Zählungen und Sichtbarkeit aus tatsächlich gespeichertem Zustand | Browser: Projekt erzeugt Aktivitätszahl 1; Name/Interessen gespeichert, Reload erhält sie. B sieht keine optionale Schule/Interessen vor Freigabe, danach nur freigegebene Felder; keine E-Mail in öffentlicher Ansicht | Lokal erfolgreich; serverseitige neue Profilfähigkeit noch bereitzustellen |
| Verbindung beim Senden verlieren | Kein verfrühter Erfolg, Entwurf bleibt, Wiederholung ohne Duplikat | Browser offline geschaltet: Fehler, kein Projekt, Eingabe bleibt; nach Reconnect eine Anlage. Separat HTTP 503 und abgerissene Antwort nach Commit getestet; Wiederholung erzeugt keine zweite Anlage | Lokal erfolgreich |
| Navigation / Zurück / Mobil | Entwürfe erhalten, Ziele erreichbar, kein horizontaler Seitenüberlauf | DE/TR/EN-Browser-Smokes prüfen Kategorien, Navigation und Zurück zum gespeicherten Entwurf; Breitenprüfung Desktop/Pixel 7, Screenshot und emulierter Arcade-Touch. Renderprüfung löst erzeugte Routen auf | Lokal erfolgreich; keine reale Hardware-/Safari-Abnahme |

Weitere Grenzen: Löschen eines inzwischen entfernten Datensatzes sowie Eigentum, beschädigte Speicherdateien und unvollständige Eingaben sind in den bestehenden Modell-/Rendertests abgedeckt. Nicht jeder dieser Randfälle wurde als zusätzlicher Browserlauf wiederholt. Die Testsuite ist keine Behauptung umfassender Fehlerfreiheit.

## 4. Neue nachgewiesene Fehler und Korrekturen

1. **Ungültiges JSON wurde als HTTP 503 ausgegeben.** Ebenso konnten nicht objektförmige Umschläge in den falschen Fehlerpfad geraten. Ein zunächst roter Test reproduzierte 503 statt 400. `platformHandler.js` prüft JSON und Objektform jetzt vor Datenbankzugriff; der Test besteht. Function-Korrektur lokal, noch nicht in der Cloud.
2. **Ungültige Serverrevision wurde als Speichererfolg akzeptiert.** Der Service akzeptierte einen formal passenden Kontostand ohne gültige Revision; AccountContext hätte ihn nicht übernommen, während das Formular trotzdem Erfolg erhalten konnte. Ein zunächst roter Regressionstest reproduzierte die fehlende Ablehnung. `src/services/supabase.js` verlangt nun eine nicht negative sichere Ganzzahl. Test für fehlende, null, negative, gebrochene und textförmige Revision erfolgreich; gültige Antworten bleiben nutzbar.

Für die reproduzierbare Prüfung wurde der bestehende HTTP-Handler ohne neues Datenmodell aus dem Deno-Einstieg in `supabase/functions/_shared/platformHandler.js` extrahiert. Deno verdrahtet weiterhin dieselben Umgebungsvariablen, Auth-Prüfung, Datenbankendpunkte und Rollen. Die lokale Testsuite verwendet genau diesen Handler; nur Auth-/SQL-Transport werden simuliert. Die vorhandene SQL-Migration bleibt unverändert.

Mehrere anfängliche Browser-Testfehler betrafen die Testdefinition: abweichende vorhandene Beschriftungen, die Sprache der Gastpersona sowie zu früh geprüfte asynchrone Speicher-/Kartenzustände. Diese wurden im Test korrigiert und erneut ausgeführt; sie werden nicht als Appfehler gezählt. Keine funktionierenden Module oder Spiele entfernt, kein größeres Redesign.

## 5. Statusmatrix

| Status | Konkreter Stand |
| --- | --- |
| **LIVE UND END-TO-END VERIFIZIERT** | Aktuell keiner der vollständigen fachlichen Mehrnutzerabläufe. Nur Auth-Erreichbarkeit, Function-Abweisung und Datenbank-/Rechtestatus wurden live geprüft. Frühere Betreiber-Login-Nachweise bleiben historisch, sind kein heutiger Zwei-Schüler-Nachweis. |
| **LOKAL FUNKTIONSFÄHIG** | Browserabläufe für Projekte/Anfragen, Eventfreigabe/Anmeldung, Nachhilfeangebote, Gruppenbeiträge/Meldungen, gemeinsames Schach, Profile/Statistiken; echte Oberfläche und HTTP-Handler, simuliertes Auth/SQL. |
| **NUR DEMONSTRATION** | Gastpersonas und ihre Zusammenarbeit; globale/schulbezogene Spielranglisten; lokale Einzelspielergebnisse und deren Freigaben. Konto-Arcade-Rekorde sind ebenfalls ausdrücklich nur gerätelokal. |
| **FEHLERHAFT / UNVOLLSTÄNDIG** | Zwei neu nachgewiesene Fehler lokal behoben. Nachhilfe-Kontaktzustellung und Antworten fehlen als gewünschter Ablauf; vorhanden ist lediglich der klar bezeichnete private Entwurf. Keine bekannte weitere nachgewiesene lokale Regression offen. |
| **DURCH EXTERNE KONFIGURATION BLOCKIERT** | Aktuelle Function-Bereitstellung, zwei bestätigte dedizierte Testzugänge, tatsächliche E-Mail-Bestätigung/-Einladung und kontrollierter Zwei-Geräte-Test über freigegebene erreichbare HTTPS-Adresse. |

## 6. Prüfungen und Ausführung

- Lokale abschließende Browserrunde: **30/30 erfolgreich**, davon 15 auf Desktop und 15 in Pixel-7-Emulation; einschließlich Offline-/Profiltests und Touch-Screenshots. Vorherige Runde 26/26 ebenfalls erfolgreich. Smartphone-Screenshot zusätzlich visuell geprüft; vollständige Seitenscreenshots enthalten eine feste Bottom-Navigation, die beim tatsächlichen Scrollen am Viewportrand bleibt.
- Nach Trennung der lokalen/Live-Ergebnisordner und Ausrichtung der Screenshots nochmals **6/6 Sprach-/Mobil-Smokes** gezielt erfolgreich. Lokale und Live-Läufe löschen ihre Artefakte nicht gegenseitig.
- `npm.cmd test`: **136/136 erfolgreich**, inklusive bestehender Fach-/Sicherheits-/Recoverytests und vier neuer HTTP-/Antwortvertragsprüfungen.
- `npm.cmd run check`: **796 Texte je Sprache**, gleiche Schlüssel und gültige Kodierung.
- `npm.cmd run check:render`: erfolgreich, **87 Routen je Demo-Profil/Sprache**, erzeugte Ziele sowie Konto-, Profil-, Benachrichtigungs-, Recovery- und alle Spiel/Kategorie-Ansichten geprüft.
- `npm.cmd run build -- --configLoader native`: erfolgreich, 130 Module, JS 546,65 kB / gzip 168,27 kB. Nicht blockierende bestehende Bundlewarnung über 500 kB.
- `npm.cmd run check:offline`: fünf tatsächlich gebaute statische Ressourcen ohne simuliertes Netz ausgeliefert; API/Privates ausgeschlossen. Zusätzlich Browser-Netzausfalltest im obigen lokalen Ablauf.
- Node-Syntaxprüfungen und `git diff --check`: erfolgreich.
- Live-Smoke: **1 ausdrücklich übersprungen**, nicht als Erfolg gezählt. Öffentliche Probe: sieben erwartete HTTP-Ergebnisse; lesende SQL-Prüfung: elf Statuswerte wahr.

Installation und Wiederholung:

```powershell
npm.cmd ci --cache .npm-cache
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path $env:TEMP 'deutschconnect-playwright'
npx.cmd playwright install chromium
npm.cmd run test:e2e
npm.cmd test
npm.cmd run check
npm.cmd run check:render
npm.cmd run build -- --configLoader native
npm.cmd run check:offline
```

Browserinstallationsversuch im OneDrive-Projekt scheiterte zuerst an dessen Verzeichnis-Lock. Der temporäre Ordner funktioniert und ist der Standard der Testkonfiguration. Tests brauchen freie Ports 4180/4181, Live-Smoke 4173. Bestehende Server auf diesen Ports werden absichtlich nicht übernommen. Die lokale Suite kann ohne Supabase-Zugang laufen. In dieser Ausführungsumgebung benötigten Browser/Vite-Befehle wegen Sandboxgrenzen die gezielte erweiterte Ausführung.

## 7. Live-Abnahme vorbereiten und auf zwei Geräten prüfen

1. **Review und ausdrückliche externe Freigabe:** aktuelle `platform`-Function einschließlich `_shared/platformHandler.js`, Profile, private Lesemarkierungen und frühere Auditkorrekturen im eigenen Testprojekt bereitstellen lassen. Keine neue SQL-Migration ist für die hier vorgenommenen Änderungen nötig. Noch keine Bereitstellung in diesem Auftrag.
2. **Zwei kontrollierte fiktive Konten:** Bestätigungsmails über einen für beide Adressen zulässigen Versand sicherstellen; keine echten Schülerkonten verwenden, Bestätigung nicht abschalten. Profile `E2E TEST A`/ERS und `E2E TEST B`/Anka Bilim, Deutsch. Kein Betreiber-/Moderatorpasswort als Testzugang einsetzen. Für Event-/Meldungsabnahme gesonderten zuständigen Moderator einbeziehen; Rollenänderungen nur nach konkreter Freigabe.
3. **Optionaler automatisierter Live-Smoke:** Zugangsdaten ausschließlich in die ignorierte `.env.e2e.local` oder lokale Prozessumgebung schreiben, niemals in Chat/Repository. Namen: `DC_E2E_A_EMAIL`, `DC_E2E_A_PASSWORD`, `DC_E2E_B_EMAIL`, `DC_E2E_B_PASSWORD`, dazu `DC_E2E_TEST_ACCOUNTS_ONLY=1`. Dann `npm.cmd run test:e2e:live`. Fehlende Zugangsdaten ergeben einen sichtbaren Skip. Der Smoke erzeugt/entfernt nur sein eigenes Testprojekt; bei Fehler einen eventuell verbliebenen eigenen Testeintrag manuell über die App entfernen.
4. **Erreichbare Testadresse:** `127.0.0.1` auf dem Handy bezeichnet das Handy. Für zwei Geräte braucht es eine ausdrücklich freigegebene gemeinsame HTTPS-Testadresse; passende Auth-Redirects und `DC_ALLOWED_ORIGINS` müssen separat genehmigt eingerichtet werden. Das kann ein kontrollierter Testhost/Proxy sein. Kein öffentliches Deployment oder Tunnel in diesem Auftrag. Reines unsicheres LAN-HTTP kann zusätzlich sichere Browserfunktionen wie Web Locks einschränken; keine Sicherheitsprüfungen dafür abschalten.
5. **Unabhängigkeit prüfen:** Gerät 1 meldet A an, Gerät 2 B. Unter Mein Bereich → Konto unterschiedliche Testadressen kontrollieren. Keine Demo-Profilumschaltung verwenden. Beide Seiten geöffnet lassen.
6. **Projekt:** A legt `E2E TEST Projekt <Datum>` an und lädt neu. B findet es unter Projekte, fragt Mitwirkung an. A öffnet Mein Bereich → Projekte → Projektdetail, sieht B, lehnt zunächst ab; B darf nicht Mitglied sein. Wiederholen und annehmen; beide laden neu. B versucht eine fremde Bearbeitungs-URL: kein Editor. Nur A bearbeitet/schließt bzw. entfernt seinen Testeintrag.
7. **Event:** A reicht fiktives zukünftiges Testevent ein. Zuständige Moderation gibt frei. B meldet sich an, lädt neu und kontrolliert Mein Bereich → Aktivitäten; A/Moderation kontrollieren die Anmeldung. B nimmt zurück. Registrierung nicht als Anwesenheit bestätigen. Organisatorische Teilnahme nur bei tatsächlich durchgeführter Aktivität dokumentieren.
8. **Nachhilfe:** A veröffentlicht Testangebot, B findet es. Kontakttext bleibt privat und wird nicht zugestellt; diesen Punkt bewusst als noch fehlenden Ablauf erfassen. Für tatsächlichen Austausch den betreuten Gruppenraum nutzen. Angebot anschließend durch A schließen/entfernen.
9. **Gruppe/Meldung:** A/B treten einem betreuten Raum bei. A sendet eindeutig fiktiven Testbeitrag, B wartet auf Poll und lädt neu. B meldet genau diesen Testbeitrag, zuständige Moderation bestätigt sichtbaren Eingang und markiert ihn geprüft. Danach eigenen Testbeitrag entfernen; private Projekträume mit einem Nichtmitglied zusätzlich direkt öffnen und den Zugriffsschutz prüfen.
10. **Schach:** A lädt das freiwillig freigegebene Profil B ein. B bleibt zunächst auf Nachhilfe; die Glocke muss ohne Reload erscheinen. B nimmt in Benachrichtigungen an, A öffnet die gleiche Partie. Abwechselnd ziehen, beide neu laden. Einvernehmlich korrekt beenden, persönliche Statistik genau einmal prüfen. Bei geschlossener Website derzeit keine externe Mail/Push erwarten; Einladung nach späterem Öffnen kontrollieren.
11. **Abschluss:** Konkrete Beobachtungen, Geräte/Browser, IDs der eigenen Testeinträge und Fehler festhalten; ausschließlich eigene Testinhalte über normale Appaktionen entfernen. Ausloggen. Erst danach den jeweiligen Ablauf als tatsächlich geräteübergreifend abgenommen markieren.

## 8. Geänderte Dateien und nächster Schritt

- Testwerkzeuge: `package.json`, `package-lock.json`, `.gitignore`, `playwright.config.js`.
- Lokale Browser-/HTTP-Umgebung: `tests/e2e/backend.js`, `tests/e2e/local.spec.js`.
- Getrennter optionaler Live-Smoke: `tests/e2e/live.spec.js`, `scripts/run-live-e2e.mjs`.
- Reproduzierbare lesende Cloudprüfung: `scripts/check-backend-live.mjs`, `scripts/e2e-live-readonly.sql`.
- Appkorrektur: `src/services/supabase.js`; Regression `scripts/server-confirmation.test.mjs`.
- Function-Testbarkeit/Eingabeprüfung: `supabase/functions/platform/index.ts`, neu `_shared/platformHandler.js`; Regressionen `scripts/http-handler.test.mjs`.
- Dokumentation: dieser Bericht, `SESSION_HANDOFF.md`, README und aktueller Hinweis in `SUPABASE-SETUP.md`.

Nächster sinnvoller Schritt ist die konkret freigegebene Bereitstellung des geprüften Function-Stands plus zwei bestätigte Testzugänge. Danach zuerst den vorbereiteten Projekt-Smoke live ausführen, anschließend Events, Gruppen/Meldung und Schach nach obiger Anleitung. Nachhilfezustellung und echte gemeinsame Ranglisten benötigen einen eigenen klar abgegrenzten Funktions-/Datenvertrag; sie werden durch erfolgreiche Oberflächentests nicht nachträglich zu vorhandenen Funktionen.

Git: Ausgangszustand war sauber; ausschließlich auf dem aktuellen Entwicklungsbranch gearbeitet. Alle Änderungen dieses Auftrags bleiben uncommittet. Keine Commits, Pushes oder Deployments.
