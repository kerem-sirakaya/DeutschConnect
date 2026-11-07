# Gezielte Qualitätsverbesserungen

**Historischer Qualitätsbericht:** Aktuelle Testergebnisse und verbleibende Prüfungen stehen in [SESSION_HANDOFF.md](SESSION_HANDOFF.md). Die folgenden Angaben beschreiben den damaligen Stand vom 7. November und sind kein vollständiger Bericht zur inzwischen eingerichteten Cloud-Anbindung.

Stand: 7. November 2026. Die bisherige Navigation, Designsprache und alle Module bleiben bestehen. Die Änderungen betreffen zuverlässige lokale Abläufe und die spätere Zusammenarbeit beider Entwicklungsteams.

## Behobene Probleme

- Beschädigte einzelne Profileigenschaften, Teilnahmen, Ideen oder Moduldatensätze lösen keinen pauschalen Demo-Reset mehr aus. Lesbare Datensätze bleiben erhalten, ungültige werden isoliert. Unlesbare Gesamtdateien und unbekannte Versionen werden nicht überschrieben.
- Laden allein schreibt keine Standardwerte zurück. Bereinigende Speicherungen sichern den unveränderten Originalstand zuerst. Sichtbare Speicherhinweise bieten erneutes Laden und einen Download der Originaldaten; ein automatischer Backup-Import ist bewusst noch nicht vorhanden.
- Aktuelle Tabs führen Änderungen über dieselbe Web-Locks-Sperre gegen den neuesten gespeicherten Stand aus. Die Persona bleibt je Tab getrennt. Veraltete Bearbeitungen werden abgelehnt statt still übernommen.
- Eigentümer können Projekte bearbeiten, zurückziehen und entfernen sowie Nachhilfeangebote und -gesuche bearbeiten, schließen und entfernen. Die Zustandslogik prüft die Zuordnung zusätzlich zur Oberfläche. Geschlossene und zurückgezogene Einträge bleiben für die eigene Verwaltung erreichbar; entfernte Einträge erscheinen nicht in den normalen Listen.
- Suchfilter überleben den Wechsel zwischen Liste und Detailansicht. Projekt-, Nachhilfe-, Profil-, Kontakt- und Beitragsentwürfe werden je Tab und Persona gehalten. Bei fehlender Entwurfsspeicherung warnt die interne Navigation; beim Schließen/Neuladen des Tabs wird bei Änderungen die Browserwarnung angefordert. Ob sie angezeigt wird, entscheidet der Browser.
- Vorgemerkte Nachhilfe besitzt eine eigene Liste und einen Link im persönlichen Bereich. Der Eventfilter heißt ausdrücklich „Veranstaltende Schule“ und filtert weiterhin die verantwortliche Schule, nicht alle zugelassenen Schulen.
- Freie Profilinteressen und Projektthemen beeinflussen die Projekt- und Partnerreihenfolge. Häufige Fachbezeichnungen auf Deutsch, Türkisch und Englisch werden auf gemeinsame Schlüssel normalisiert. Direkte Nachhilfetreffer benötigen gegensätzliche Einträge, dasselbe Fach, eine gemeinsame Sprache und ein vereinbares Format. Allgemeine Interessenentdeckung ist getrennt beschriftet.
- Optionale Projektangaben sind einklappbar. Fehler sind mit dem betroffenen Feld verknüpft; die Validierung öffnet nötige Abschnitte und fokussiert das erste ungültige Feld. Größere Touchflächen und Metadaten sowie automatisches Sichtbarhalten aktiver Untertabs verbessern die mobile Bedienung. Speicheraktionen geben erst nach erfolgreicher Persistierung Erfolg zurück.

## Betroffene Dateien

- Zustand und Daten: `src/data/demoState.js`, `modules.js`, neu `matching.js`, `recordHistory.js`; `src/state/DemoContext.jsx`, neu `localRepository.js`, `pageMemory.js`, `usePageMemory.js`.
- Seiten und Routing: `src/App.jsx`; `src/pages/Home.jsx`, `Events.jsx`, `Ideas.jsx`, `IdeaSubmit.jsx`, `IdeaDetails.jsx`, `Tutoring.jsx`, `TutoringNew.jsx`, `TutoringDetails.jsx`, `MyArea.jsx`, `Community.jsx`, `Network.jsx`.
- Komponenten: `Navigation.jsx`, `UI.jsx`, `FormFields.jsx`, `IdeaCard.jsx`, `TutoringCard.jsx`, `ParticipationControl.jsx`, `InterestToggle.jsx`, `CommunityCards.jsx`, `ReportControl.jsx`; neu `ContentManagement.jsx`, `PersistenceNotice.jsx` unter `src/components`.
- Gestaltung und Sprachen: `src/styles/global.css`, `modules.css`, `src/i18n/LanguageContext.jsx`, die drei `src/locales/modules/*.json`, neu die drei `src/locales/quality/*.json`.
- Prüfung und Dokumentation: `package.json`, `scripts/check-locales.mjs`, `check-render.mjs`, neu `state-quality.test.mjs`, `navigation-matching.test.mjs`; `README.md`, dieses Dokument und `docs/INTEGRATION.md`.

## Automatisierte Prüfung und Grenzen

`npm.cmd test` prüft bestehende Personalisierung, Teilnahmen, Ideen, Nachhilfe, Community und UTF-8 sowie neue Regressionen zu isolierter Wiederherstellung, konkurrierenden Repository-Instanzen, Eigentum, Lebenszyklus, Formularspeicher und sprachübergreifendem Matching. `npm.cmd run check` vergleicht alle drei Sprachverträge und sucht beschädigte Zeichen. `npm.cmd run check:render` prüft die Routen mit beiden Personas in allen drei Sprachen, einschließlich korrekter Überschriften und Bearbeitungszugriffen. `npm.cmd run build` erzeugt den Produktions-Build.

Ergebnis dieses Durchlaufs: **42 Tests bestanden**, **428 Übersetzungseinträge je Sprache geprüft**, **378 reguläre Renderkombinationen plus 12 Wiederherstellungszustände erfolgreich**, **Produktions-Build erfolgreich**. Der Vite-Entwicklungsserver startete; Startseite, Einstiegsskript und App-Modul wurden jeweils mit HTTP 200 ausgeliefert. Der nur für diese Prüfung gestartete Server wurde danach beendet. Eine zusätzliche Suche nach Ersatzzeichen und typischen UTF-8-Schäden in Quellcode, Tests und Dokumentation ergab keine Treffer. `git diff --check` meldete keine Whitespace-Fehler; Git wies nur auf die lokale LF/CRLF-Konvertierung der README hin. Alle Arbeiten fanden auf `codex-version-1.0` statt, ohne Commit, Push oder Deployment.

Serverseitiges React-Rendering beweist keine Browserinteraktion. Der Browserzugriff dieser Arbeitsumgebung war nicht verfügbar; auch der native Zugriff wurde wegen nicht sicher erkennbarer URL beendet. Deshalb sind reale Klick-, Fokus-, Screenreader-, Browser-Speicherereignis- und Smartphone-Layouttests noch offen. Die Repository-Paralleltests simulieren konkurrierende Instanzen und Sperren, ersetzen aber keinen Mehrtabtest im Browser.

Für die manuelle Abnahme bei 320, 375 und 390 Pixel Breite sowie auf Desktop: Listen filtern und aus Details zurückkehren; lange Formulare verlassen/wieder öffnen; Feldfehler im eingeklappten Abschnitt auslösen; Untertabs wechseln; eigene Einträge bearbeiten/schließen/entfernen; dasselbe Formular in zwei Tabs bearbeiten; unabhängige Teilnahmen in beiden Tabs speichern; Sprache und Persona wechseln. Prüfen, dass Inhalte oberhalb der unteren Navigation erreichbar und aktive Tabs sichtbar bleiben.

## Weiterhin lokale Demo

Konten, Berechtigungen, Teilnahmen, Projektmitwirkung, Nachhilfeinteresse, Kontaktentwürfe, Beiträge, Freigaben und Meldungen sind lokale Demonstrationen. Keine Daten werden an andere Geräte, Schulen oder Moderatoren gesendet. Freie Texte werden nicht automatisch übersetzt. Das Matching ist nachvollziehbar regelbasiert und prüft weder konkrete Terminüberschneidungen noch fachliche Eignung; unbekannte Begriffe werden als normalisierter Freitext verglichen.

Eine spätere gemeinsame Datenbankanbindung, serverseitige Rechte, echte Anmeldung und betreute Kommunikation sind nicht Teil dieses Schritts. Modelle, Speicherstellen, statische Importe, nötige Schnittstellen und die vom zweiten Team benötigten Informationen stehen in [INTEGRATION.md](INTEGRATION.md).
