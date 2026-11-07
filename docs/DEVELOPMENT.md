# Lokale Entwicklung

**Historische Grundlage:** Aktueller Stand, geprüfte Startbefehle, echte Konten und nächste Schritte stehen in [SESSION_HANDOFF.md](SESSION_HANDOFF.md) und [SUPABASE-SETUP.md](SUPABASE-SETUP.md). Die folgenden Abschnitte dokumentieren die frühere lokale Demo und dürfen nicht als heutige Backend-Grenze verstanden werden.

DeutschConnect verwendet React 19, Vite 7, JavaScript/JSX und CSS. Die Anwendung ist eine personalisierte lokale Demo mit zwei fiktiven Profilen. Es werden keine externen Schriftarten oder UI-Bibliotheken geladen. Die Paketversionen sind in `package-lock.json` festgehalten.

Die neu hinzugekommenen Nachhilfe-, Initiativen-, Community- und freien Projektfunktionen, die aktuelle Navigation und ihre Grenzen sind in [MODULES.md](MODULES.md) beschrieben. Dort steht auch der neueste Prüfstand. Die folgenden Abschnitte dokumentieren weiterhin die Grundlage des vorherigen Redesigns.

## Start unter Windows

Im Projektordner:

```powershell
npm.cmd install
npm.cmd run dev
```

Nach der bereits erfolgten Installation genügt `npm.cmd run dev`. Die im Terminal ausgegebene Adresse öffnen, normalerweise `http://127.0.0.1:5173/`. Der Server ist auf die lokale Schnittstelle beschränkt. Bei belegtem Port zeigt Vite einen anderen Port an. Mit `Strg+C` beenden.

`npm.cmd` umgeht die PowerShell-Sperre für `npm.ps1`, ohne die Ausführungsrichtlinie zu ändern.

## Prüfungen und Produktionsausgabe

```powershell
npm.cmd run check
npm.cmd test
npm.cmd run check:render
npm.cmd run build
npm.cmd run preview
```

`check` prüft gleiche Übersetzungsschlüssel und nicht leere Texte in allen drei Sprachen. `test` prüft die Personalisierungs- und Zustandslogik mit Node.js, ohne zusätzliche Testbibliothek. `check:render` rendert die Routen beider Profile in allen Sprachen über Vite und React. Es ist kein Browser- oder Layouttest. `build` erzeugt die statische Website in `dist/`. `preview` stellt diesen Build lokal bereit; es veröffentlicht die Website nicht.

## Aufbau und Entscheidungen

### Zeichenkodierung

Alle Projekttexte werden als UTF-8 gespeichert; `.editorconfig` legt dies für unterstützende Editoren fest. Unter Windows PowerShell 5.1 kann eine Pipeline zu Node.js nicht-ASCII-Zeichen bereits vor dem Schreiben durch `?` ersetzen. Für Quelltextänderungen deshalb bevorzugt `apply_patch` verwenden. Falls eine solche Pipeline nötig ist, muss ihre Ein- und Ausgabe ausdrücklich auf UTF-8 eingestellt werden; ein `writeFileSync(..., 'utf8')` allein repariert zuvor verlorene Zeichen nicht.

`npm.cmd run check` prüft zusätzlich gültige UTF-8-Bytes, kaputte Zeichenfolgen und unerwartete Fragezeichen in Übersetzungen. Absichtliche Fragen bleiben erlaubt. Der Rendercheck erkennt beschädigte sichtbare Trennzeichen und Pfeile. Die Regressionstests prüfen deutsche und türkische Sonderzeichen sowie typische Fehlerbilder. Bereits selbst eingegebene und lokal gespeicherte Texte werden nicht automatisch umgeschrieben.

- `src/pages/`: persönliches Dashboard, Eventlisten und Details, Ideenlisten, Ideeneingabe und Details, Schulverzeichnis und Schulprofile, geplanter Pilot, eigener Bereich, Über uns und Fehlerseite.
- `src/components/`: gemeinsame Navigation, Sprachwahl, Hero, Icons, Karten und kleine UI-Bausteine.
- `src/locales/`: zentrale deutsche, türkische und englische Texte einschließlich Beispieldaten.
- `src/i18n/LanguageContext.jsx`: gemeinsamer Sprachzustand, `lang`-Attribut, Seitentitel und Beschreibung.
- `src/data/activities.js`: stabile Event-IDs, Kategorien, fiktive Termine, beteiligte Schulen und Schulbezeichnungen.
- `src/data/demoState.js`: fiktive Ausgangsprofile, validiertes Laden, unveränderliche Zustandsupdates und gemeinsame Selektoren für persönliche Events, Ideen und Empfehlungen.
- `src/state/DemoContext.jsx`: verbindet die UI mit Demo-Zustand, Sprache und lokaler Speicherung. Eine spätere Datenanbindung kann an dieser Grenze ansetzen; echte Berechtigungsprüfungen gehören auf den Server.
- `src/styles/global.css`: Farbvariablen, Komponenten und responsive Breakpoints.
- `scripts/check-locales.mjs`: Prüfung des Übersetzungsumfangs.

Die Navigation verwendet Hash-URLs ohne zusätzliche Router-Bibliothek oder Server-Rewrite-Regeln. Die fünf Hauptbereiche sind Übersicht, Events, Ideen, Netzwerk und Mein Bereich. Über uns bleibt unter `#/about` und über Mein Bereich sowie den Footer erreichbar. Event-Unterseiten sind `#/events/my`, `#/events/recommended` und `#/events/all`; Ideen haben persönliche Listen, eine gemeinsame Demo-Übersicht und ein Formular unter `#/ideas/new`. Die alten Übersichts- und Eventdetail-URLs bleiben erreichbar.

Die untere mobile Navigation und die obere Desktopnavigation verwenden dieselbe Komponente. Bei einem Seitenwechsel erhält der Hauptinhalt den Tastaturfokus. Detailkarten merken ihre Herkunft über einen geprüften `from`-Parameter, damit der Zurück-Link zum Ausgangsbereich führt. Beim Profilwechsel werden offene Formulare und lokale Listenfilter zurückgesetzt, damit Entwürfe nicht versehentlich dem anderen Profil zugeordnet werden.

Die Sprache wird unter `deutschconnect.language` gespeichert. Beim ersten Besuch wird die Browsersprache berücksichtigt; für nicht unterstützte Sprachen gilt Deutsch. Jedes Demo-Profil besitzt danach eine eigene bevorzugte Sprache. Der Sprachumschalter aktualisiert diese Präferenz; beim Profilwechsel wird sie angewendet.

Der versionierte Zustand unter `deutschconnect.demo.v1` enthält die aktive Persona, Präferenzen, Teilnahmen und Ideen. Bei defekten gespeicherten Daten werden gültige Demovorgaben verwendet. Bei gesperrtem oder vollem Browserspeicher erscheint ein Hinweis; die Anwendung funktioniert für die laufende Sitzung weiter. `localStorage` ist weder Authentifizierung noch eine sichere Datenablage oder Synchronisierung.

## Zwei Profile vergleichen

Im Demo-Umschalter unter der Hauptnavigation zwischen den fiktiven Profilen wechseln:

| Profil | Schule und Interessen | Persönlicher Ausgangszustand | Erste Empfehlung |
| --- | --- | --- | --- |
| Alex | ERS; Technik und Wissenschaft | Interesse an der Codewerkstatt, eigene Idee „Code verbindet unsere Schulen“ | Ideenlabor |
| Deniz | Anka Bilim; Sprache und Kultur | Demo-Teilnahme an der Sprachwerkstatt, noch keine eigene Idee | Kulturbegegnung |

1. Alex auswählen, Codewerkstatt öffnen und Interesse in eine Demo-Teilnahme ändern. Die Änderung erscheint in Alex’ Übersicht und Eventliste.
2. Zu Deniz wechseln: Die persönliche Eventliste und die Ideenansicht bleiben davon unabhängig. Deniz’ voreingestellte Sprache ist Türkisch und kann oben geändert werden.
3. In Mein Bereich Interessen oder Schule ändern und speichern: Empfehlungen passen sich an. Bereits gewählte Events bleiben erhalten.
4. Eine Idee einreichen: Sie erscheint bei der aktiven Persona unter Meine Ideen und im gemeinsamen lokalen Demo-Verzeichnis. Auch andere Demo-Personas können dort mitwirken; dadurch wird die Idee zusätzlich in deren persönlicher Liste sichtbar. Es gibt keine privaten Datenbereiche oder echten Zugriffsgrenzen.

Empfehlungen setzen die im Demoformat beteiligte Schule voraus und berücksichtigen zuerst passende Interessen, anschließend die veranstaltende Demo-Schule. Bereits gewählte Events werden nicht nochmals empfohlen. Die Begründung ist auf den Empfehlungskarten sichtbar. Es gibt keine Einladungsdaten; entsprechend wird kein Einladungsbereich dargestellt.

Die neun Originalreferenzen liegen weiterhin unter `design references/`, abweichend vom in README Abschnitt 21 genannten Pfad `docs/design-references/`. Die Dateien wurden nicht verschoben. Die CSS-Farben orientieren sich an den JPEG-Referenzen; sie sind keine verbindlichen Original-Farbwerte. Das Netzwerkdiagramm ist eine CSS/SVG-Illustration und keine zusätzliche Funktionsanzeige.

## Funktionierend

- Persönliches Dashboard mit maximal zwei Einträgen je Modul und direkten Links zu den vollständigen Listen.
- Eigene Events, begründete Empfehlungen und gemeinsames Eventverzeichnis mit Suche sowie Themen- und Schulfilter.
- Demo-Interesse, Demo-Teilnahme und Rücknahme über Eventdetails, getrennt nach Persona.
- Eigene und gemeinsame Ideen, validiertes Einreichen sowie Mitwirkung und Rücknahme.
- Schulverzeichnis mit Suche, Schulprofilen und gesonderter Ansicht der geplanten Kooperation.
- Bearbeitbarer Demo-Anzeigename, Schule, Interessen und bevorzugte Sprache.
- Vollständige feste Oberflächentexte in DE/TR/EN, responsive Gestaltung, Skip-Link, Fokuszustände und native Formulare.

## Grenzen und nächste Schritte

Profile, Eventtermine und vorgegebene Ideen sind ausdrücklich fiktive Beispiele. Demo-Teilnahmen und eingereichte Ideen werden nur lokal gespeichert. Es existieren keine bestätigten Veranstaltungstermine, echten Anmeldungen, Übermittlung an Schulen, authentifizierten Nutzerkonten, Datenbank oder schulübergreifende Synchronisierung. Keine echten Schülerdaten eingeben. ERS wird als Projektursprung und Anka Bilim als vorgesehener Schulpartner dargestellt; der Pilot ist noch abzustimmen.

Echte Konten, sichere Rollen, private Einladungen, verlässliche Veranstaltungsanmeldungen, schulische Freigaben und gemeinsame Daten benötigen eine abgestimmte Server-/Backend-Lösung. Diese Demo implementiert dafür keine clientseitigen Sicherheitsversprechen. Auch echte Benachrichtigungen werden nicht simuliert. Nutzertexte werden nicht automatisch übersetzt.

Als Nächstes: Darstellung und Tastaturbedienung auf Smartphone und Desktop in allen drei Sprachen prüfen, Übersetzungen durch sprachkundige Teammitglieder prüfen lassen und den ersten realen Teilnahme- und Freigabeprozess mit den Schulen abstimmen.

## Prüfstand des Redesigns

- Installation erfolgreich; npm meldete bei der Installation keine bekannten Sicherheitslücken.
- Produktions-Build erfolgreich.
- Übersetzungscheck erfolgreich: je 212 nicht leere Einträge mit übereinstimmenden Schlüsseln.
- Neun Tests erfolgreich: Profilunterschiede, Isolation von Teilnahmen, Rücknahme, geänderte Empfehlungen, Ideenbesitz, Mitwirkung, gespeicherte Zustände, ungültige Daten und kombinierte Eventfilter in allen drei Sprachen.
- Vier zusätzliche Regressionstests erfolgreich: UTF-8-Sonderzeichen, ungültige Kodierung, verlorene Zeichen in Übersetzungen und beschädigte JSX-Trennzeichen. Insgesamt bestehen 13 Tests.
- React-Rendercheck über Vite erfolgreich: 25 Routen × zwei Profile × drei Sprachen, insgesamt 150 Kombinationen. Dieser Check ersetzt keine Interaktion im Browser.
- Lokaler Vite-Start erfolgreich; Startseite sowie überarbeitete App-, Zustands-, Profil-, Formular- und CSS-Module lieferten HTTP 200.
- Der Browserzugriff ist in der Arbeitsumgebung nicht verfügbar. Mobile/desktop Darstellung, Touch- und Tastaturbedienung sowie tatsächliches Browser-Reload-Verhalten sind noch nicht visuell beziehungsweise interaktiv verifiziert. Die CSS-Regeln sind mobile-first; dies ist kein bestandener Layouttest.

Installation und Build benötigten in der Codex-Arbeitsumgebung erweiterten Zugriff: Die Sandbox blockierte zunächst Registry-Zugriff und den Dateizugriff des nativen Build-Werkzeugs. An den Windows-Sicherheitsrichtlinien wurde nichts geändert.
