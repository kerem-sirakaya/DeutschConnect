# Einheitliche Bestenlisten für die vier Spiele

**Nachtrag Self-Audit, 8. November 2026:** Ergebnisproduzenten gegen ungültige Zustände abgesichert, identische Speicherung aktualisiert veraltete Tabs, Schachrekonstruktion stoppt nach automatischem Spielende. Ungespeicherte Ergebnisse schützen jetzt auch die interne Navigation mit Rückfrage und das Schließen über Browserwarnung; nach bewusst bestätigtem Verlassen können ungespeicherte Runden weiterhin verloren gehen. Aktuell 132 Tests und 796 Texte je Sprache erfolgreich. Der spätere Auditauftrag enthält auch lokale Backend-Korrekturen; Aussagen unten „kein Backend geändert“ und frühere Testzahlen beziehen sich ausschließlich auf den ursprünglichen Spieleauftrag. Vollständiger aktueller Bericht: [SELF-AUDIT.md](SELF-AUDIT.md).

Stand: 8. November 2026. Auf dem bestehenden Branch `codex-version-1.0` umgesetzt. Bestehende uncommittete Änderungen aus der Navigations-/Profilarbeit bleiben erhalten. Keine neuen Abhängigkeiten, Datenbankmigrationen, Cloud-Änderungen, Commits, Pushes oder Deployments.

## Implementierte Ansichten

`GameLeaderboard.jsx` wird in allen vier Spielen und im Spieleverzeichnis verwendet. Die Spielauswahl führt innerhalb derselben Anwendung zum gewählten Spiel. Es gibt keine neue Hauptnavigation. Alle vier Spiele besitzen dieselben drei Kategorien, deren Auswahl je Profil und Spiel gemerkt wird:

| Kategorie | Gastdemo | Angemeldetes Konto |
| --- | --- | --- |
| Global | Alle freiwillig teilnehmenden fiktiven Profile dieses Browsers mit tatsächlich gespeicherten Ergebnissen. Eindeutig als lokale Demo bezeichnet. | Ansicht erreichbar, aber keine vorgetäuschte globale Liste: Der fehlende gemeinsame Ranglistendienst wird erklärt. |
| Meine Schule | Dieselbe lokale Liste, gefiltert nach der aktuellen Schule im Profil. Ohne Schule keine Schulrangliste. | Ansicht erreichbar; erklärt fehlende gemeinsame Daten und nicht verifizierte Schulzugehörigkeit. |
| Persönlich | Eigene Rekorde, Abschlüsse, Historie und eigener Rang in Global/Meine Schule, sofern teilgenommen wird. | Eigene Arcade-Ergebnisse dieses Geräts. Schach verwendet die bereits vom Server gelieferte persönliche Partieliste; keine Vermischung mit Gastdaten. |

Die Teilnahme an jeder einzelnen Demo-Spielrangliste ist standardmäßig ausgeschaltet. Einschalten gibt nur Anzeigename und Punktestand für die lokale Demo frei. Ausschalten entfernt den Listeneintrag, erhält aber die persönliche Historie. Das bestehende Community-Profil-Opt-in wird nicht als Zustimmung zur Rangliste behandelt. Blockierte Profile werden in beiden Richtungen berücksichtigt.

Es sind keine Beispielpunkte oder fiktiven Sieger vorgegeben. Leere Listen erklären, dass erst gespielt und freiwillig teilgenommen werden muss. Ergebnisse in automatischen Tests sind Test-Fixtures und werden nicht mit der App ausgeliefert.

## Bewertungssysteme

### Schach

- Ein abgeschlossener, gültiger Sieg gegen ein anderes Profil ergibt einen Punkt.
- Niederlagen und Remis werden persönlich getrennt gezählt und ergeben null Punkte.
- Die Auswertung wird aus eindeutigen Partie-IDs berechnet. Es gibt keinen zusätzlich hochgezählten, potenziell doppelten Siegzähler.
- Für Schachmatt und automatische Remis wird die gespeicherte Zugfolge rekonstruiert und mit dem Ergebnis verglichen. Ungültige Zugfolgen, falsches Matt, nicht begründete Remisansprüche, laufende/abgebrochene Partien und Selbstherausforderungen ergeben keine Punkte.
- Eine ausdrückliche Aufgabe oder ein vereinbartes Remis kann eine bereits begonnene Partie beenden. Ein vor dem ersten legalen Zug beendetes Spiel wird nicht gewertet. Bloßes Verlassen der Seite beendet eine laufende Partie nicht als Sieg.
- Hotseat-Partien am selben Gerät sind separate Übungspartien. Sie erhalten keine Punkte und werden weder als eigener Sieg noch als eigene Niederlage ausgegeben. Die persönliche Gesamtzahl abgeschlossener Partien enthält gültige Übungspartien; deren Zahl wird zusätzlich separat angezeigt.
- Herausforderungen zwischen Demo-Profilen bleiben unbestätigte lokale Demo-Ergebnisse. Auch eine rekonstruierte Zugfolge macht daraus keinen echten Online-Sieg.
- Bei echten Konten stammen persönliche Schachpartien aus der vorhandenen serverseitig gefilterten Partieliste. Diese Liste enthält nur die für das Konto erlaubten Partien und ist keine vollständige globale Ranglistendatenquelle.
- Kein ELO-System ergänzt. Die vorhandene Schachmechanik und Backend-Befehlsprüfung bleiben unverändert.

### Symbol Pairs / Symbolpaare

Erst ein vollständiges Spiel mit allen sechs unterschiedlichen Paaren ergibt genau einen Punkt. Das Deck muss zwölf Karten mit genau zwei Exemplaren jedes Symbols enthalten. Unvollständige Spiele, doppelte Paare oder Neustarts vor Abschluss zählen nicht. Zeit und benötigte Züge beeinflussen die Rangfolge nicht; die Zuganzahl bleibt in der persönlichen Historie sichtbar. Ein erneutes Speichern derselben Runde erhöht die Abschlusszahl nicht.

### Paper Flight / Papierflug

Nur der höchste gültige Punktestand eines beendeten Durchgangs zählt. Werte verschiedener Runden werden nicht addiert. Ein Verlassen oder Neustarten vor Spielende reicht nicht zur Speicherung eines Ergebnisses.

Die Geschwindigkeit steigt mit der aktiven Spielzeit sanft gemäß `160 + 100 × (1 − exp(−Zeit/80))` und bleibt auf höchstens 260 Spieleinheiten pro Sekunde begrenzt. Der Spawn-Abstand wird der Geschwindigkeit angepasst (`304/Geschwindigkeit` Sekunden), damit die räumlichen Abstände nicht kollabieren. Die Lückenhöhe bleibt bei 130 Einheiten. Ein Neustart setzt Zeit, Tempo, Hindernisse und Punkte zurück; Pause/Fortsetzen setzt denselben Durchgang fort. Die bisherigen Pointer-, Leertasten- und Pfeiltasten-Eingaben bleiben erhalten.

### Bridge Runner / Brückenläufer

Nur der höchste gültige Punktestand eines beendeten Einzeldurchgangs zählt. Sprungphysik, Hindernisse und bisherige Geschwindigkeitsentwicklung bleiben erhalten. Runden werden nicht zusammengerechnet.

### Gleichstände

Gleiche Punktzahl ergibt denselben Rang nach dem Muster **1, 1, 3**. Innerhalb eines Gleichstands folgt die reine Anzeigereihenfolge der stabilen Profil-ID. Zeit, möglichst viele Versuche oder ein früheres Konto verschaffen keinen besseren Rang. Die eigene Zeile wird zusätzlich mit „Du“ und einer Hintergrundfarbe gekennzeichnet.

## Speicherung und Fehlerverhalten

`resultRepository.js` ist eine ausdrücklich lokale Speichergrenze, kein zweites Supabase-Modell. Die Schlüssel lauten:

- Gastdemo: `deutschconnect.game-results.v1:demo`.
- Konto: `deutschconnect.game-results.v1:` plus URL-kodierter Geltungsbereich `account:<eigene ID>`.

Die Datei enthält eine Version, einzelne abgeschlossene Arcade-Runden und spielbezogene Demo-Freigaben. Konten, andere Konten und Gastdemo werden getrennt geladen. Die Speicherung verwendet Web Locks und liest bei jeder Änderung den neuesten Stand; gleichzeitige Tabs überschreiben sich nicht gegenseitig. Pro Runde wird eine stabile `run-…`-ID erzeugt und bei Wiederholungen beibehalten. Gleiche ID mit identischem Ergebnis ist idempotent; ein geändertes Ergebnis unter derselben ID wird abgelehnt. Schach benötigt keinen zusätzlichen lokalen Ergebniseintrag, weil die Partien selbst die Quelle sind.

Gespeicherte Runden ermöglichen die Rekord- und Abschlussberechnung nach Neuladen sowie die persönliche Historie. Diese zeigt zunächst zehn Einträge und kann schrittweise erweitert werden. Alte Schachaufzeichnungen besitzen nicht immer einen Abschlusszeitpunkt; dann wird der vorhandene Beginn verwendet oder „Zeitpunkt nicht erfasst“ angezeigt. Ungültige Datumswerte lassen die Ansicht nicht abstürzen.

Frühere Schlüssel `deutschconnect.best.runner` und `.flight` werden nicht gelöscht und nicht automatisch einem Profil zugewiesen. Solche Altwerte erscheinen beim jeweiligen Spiel als früherer Gerätebestwert ohne Profilzuordnung; sie erzeugen keinen Ranglisteneintrag. Neue Runden werden ausschließlich der tatsächlich aktiven Identität zugeordnet.

Bei fehlendem Speicher, fehlenden Web Locks, Quotenfehlern, ungültigem JSON oder unbekannter Version wird ein Fehler gezeigt. Beschädigte Originaldaten werden nicht mit Standardwerten überschrieben. Fehlgeschlagene neue Ergebnisse können innerhalb der geöffneten Ansicht erneut gespeichert werden, ohne doppelt zu zählen. Wer die Ansicht vor erfolgreicher Speicherung verlässt, kann diese noch ungespeicherten Ergebnisse verlieren; darauf wird hingewiesen. Spiele bleiben bedienbar. Der Ergebnisspeicher ist auf zwei Millionen Zeichen begrenzt; es wird keine alte Historie stillschweigend gelöscht, um Platz zu schaffen.

**Datenschutzgrenze:** Lokaler Browserspeicher ist keine Zugriffskontrolle oder manipulationssichere Ergebnisquelle. Andere Konten werden in der Anwendung getrennt dargestellt; ein Geräteadministrator oder Code derselben Origin kann Browserspeicher lesen. Keine Kontaktdaten, Passwörter, E-Mails oder privaten Nachrichten werden für Ranglisten übernommen. Die lokale Demo sendet keine Ergebnisse an einen Server.

## Supabase-Bestandsaufnahme und sicherer Ausbau

Die bestehende Architektur verwendet einen JSONB-Workspace, `dc_commands` und den atomaren `dc_commit`-Aufruf. Die Edge Function überprüft Identität, Eigentum, Rollen und Spielebefehle und liefert eine gefilterte Benutzersicht. Schachzüge werden bereits serverseitig rekonstruiert. Für die drei Arcade-Spiele existieren bislang weder serverseitig gestartete Durchgänge noch eine gemeinsame Ergebnisprüfung. Deshalb wäre es unsicher, die neuen lokalen Punktezahlen unmittelbar in die echte globale Liste zu übernehmen.

Es wurde **keine Backend-Datei für diesen Spieleauftrag geändert**, keine neue Tabelle angelegt und kein Resultat an Supabase gesendet. Die lokal bereits vorhandenen Änderungen aus dem Profilauftrag werden dabei nicht mit einer Bereitstellung gleichgesetzt.

Ein späterer abgestimmter Ausbau sollte die bestehende Schnittstelle erweitern:

1. Spielbezogene freiwillige Ranglistenteilnahme serverseitig speichern. Bei Entzug auch serverseitig keine öffentlichen Zeilen mehr ausliefern; private Historie erhalten. Pseudonyme und Punkte reichen für die Ausgabe.
2. Schachranglisten aus eindeutigen, servergeprüften abgeschlossenen Online-Partien berechnen. Hotseat/Demo ausschließen, Selbstpartien und wiederholte Übermittlungen abweisen, Missbrauch durch abgesprochene Siege berücksichtigen.
3. Arcade-Runden serverseitig mit eindeutiger ID, Identität, Regelversion und reproduzierbarem Seed beginnen. Abschlüsse bzw. Eingaben nach den Spielregeln überprüfen; reine Behauptungen wie `{score:9999}` reichen nicht. Für reaktionsbasierte Spiele bleiben manipulierte Clients/Bots ein weiter zu behandelndes Risiko.
4. Ergebnis-ID und Befehl-ID atomar gegen Doppelübermittlung absichern, nachvollziehbare Grenzen und Rate Limits setzen. Gesamtrekorde aus gültigen Ergebnissen ableiten.
5. Schule aus einer tatsächlich überprüften Zuordnung ermitteln oder die Schulrangliste weiterhin als unbestätigt kennzeichnen. Die bisherige Profil-Schule ist Selbstauskunft.
6. Gefilterte globale/Schulansichten und persönliche Daten getrennt liefern; keine vollständigen Partieverläufe anderer Schüler veröffentlichen. Aufbewahrung, Löschung und beaufsichtigten Betrieb abstimmen.

Die ergänzbaren Datenfelder lassen sich zunächst innerhalb des bestehenden JSON-Modells prüfen. Eine spätere normalisierte Struktur oder Migration wäre eine gesonderte Entscheidung und wurde hier weder eingeführt noch ausgeführt.

## Betroffene Dateien dieses Auftrags

- Neu: `src/components/GameLeaderboard.jsx` – gemeinsame Auswahl, Kategorien, Tabellen und persönliche Historie.
- Neu: `src/games/leaderboards.js` – Bewertungs-/Sortierregeln, Ergebnisvalidierung und Selektoren.
- Neu: `src/games/resultRepository.js` – getrennte, serialisierte lokale Speicherung.
- Neu: `src/games/GameResultsContext.jsx` – React-Anbindung, Speicherstatus und Wiederholungen.
- Geändert: `src/pages/Games.jsx` – Einbindung des Providers und der gemeinsamen Komponente.
- Geändert: `src/games/ArcadeGame.jsx`, `MemoryGame.jsx` – tatsächliche Spielabschlüsse erfassen.
- Geändert: `src/games/arcade.js` – sanft steigende Papierflug-Schwierigkeit.
- Geändert: `src/styles/games.css`, `src/locales/platform/{de,tr,en}.json` – Gestaltung und vollständige feste Texte.
- Neu: `scripts/leaderboards.test.mjs`; erweitert: `scripts/check-render.mjs`.
- Dokumentation: dieses Dokument, `README.md`, `docs/SESSION_HANDOFF.md`.

## Tatsächlich ausgeführte Prüfungen

- `npm.cmd test`: **109 Tests bestanden**, darunter 14 neue Spiel-/Ranglistentests. Sieger/Verlierer/Remis, falsche Ergebnisse, Hotseat-Ausschluss, tatsächlicher Schachmatt-Ablauf mit vorhandenen Reducern, vollständige Symbolpaare, Highscores statt Summen, Schulfilter, Opt-in/Entzug, Ranggleichstände, Deduplizierung, parallele Tabs, Neuladen, Kontentrennung, unveränderte Altwerte und Speicherfehler geprüft.
- Physiksimulation: Bei maximalem Papierflug-Tempo wurden 20 Hindernisse mit abwechselnd niedrigster und höchster zulässiger Lücke ohne Kollision passiert. Die Geschwindigkeit ist monoton, begrenzt und nach Neustart zurückgesetzt. Bestehende Sprung-/Flugmodelle reagieren weiter auf ihre Eingaben.
- `npm.cmd run check`: **775 Texte je Sprache**, gleiche Schlüssel und gültige Kodierung in DE/TR/EN.
- `npm.cmd run check:render`: alle bisherigen Modul-/Routenprüfungen sowie **alle zwölf Spiel-/Kategorie-Kombinationen im Demo- und Kontomodus je Sprache** erfolgreich. Tatsächlich befüllte Demo-Tabellen, eigene Zeilen, Schulfilter, persönliche Historie und fehlende echte globale Daten geprüft.
- `npm.cmd run build -- --configLoader native`: erfolgreich; vorhandene Warnung über ein JavaScript-Bundle von mehr als 500 kB bleibt.
- `npm.cmd run check:offline`: fünf gebaute statische Ressourcen ohne simuliertes Netz verfügbar; private/API-Anfragen ausgeschlossen.
- `git diff --check`: erfolgreich; mögliche LF/CRLF-Hinweise sind keine Fehler.

**Offen:** echte Browserklicks, Touch, Tastatur im laufenden Browser, Smartphone-Screenshots und Mehrgeräte-Abnahme. Der Browserzugriff meldete erneut „The browser access host is unavailable“. Die bekannte unzuverlässige native Fenstersteuerung wurde nicht wieder als bestandene Prüfung ausgegeben. Modell- und Renderprüfungen ersetzen keine interaktive Abnahme.

## Kurze manuelle Abnahme

1. Gastdemo → Community → Spiele. In jedem Spiel Global, Meine Schule und Persönlich öffnen.
2. Pro Spiel teilnehmen, ein Ergebnis erzielen, neuladen und persönlichen Rekord prüfen. Danach Teilnahme ausschalten: öffentlicher Eintrag verschwindet, persönliche Daten bleiben.
3. Zu Deniz wechseln, spielen/teilnehmen und die beiden Schulen vergleichen. Keine künstlichen Werte ergänzen.
4. Symbolpaare vollständig lösen, unvollständig neu starten und bei Papierflug/Brückenläufer hohe und niedrigere Folgerunden vergleichen. Niedrigere Folgerunden dürfen den Rekord nicht ersetzen.
5. Eine Demo-Schachherausforderung annehmen und beenden. Hotseat, laufende Partien und Abbruch dürfen keinen Sieg erzeugen.
6. Auf dem Smartphone Touchflächen, lange Namen, drei Kategorien und Unterseiten prüfen; am Desktop Leertaste/Pfeiltaste, Pause/Fortsetzen und Neustart testen. Alle drei Sprachen verwenden.
