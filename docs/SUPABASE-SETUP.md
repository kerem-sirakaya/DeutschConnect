# Eigenes Supabase-Backend und benutzbare Spiele

**Aktueller Nachtrag vom 8. November 2026:** Erreichbarkeit, Migration, `platform` ACTIVE/Version 2, RLS und explizite Zugriffssperren erneut live lesend geprüft. Keine Cloudänderung durchgeführt. Die neueren lokalen Profil-/Benachrichtigungs-/Auditkorrekturen einschließlich `_shared/platformHandler.js` sind noch nicht bereitgestellt. 30 erfolgreiche Browserprüfungen verwenden ausdrücklich lokalen simulierten Auth-/SQL-Transport; sie ersetzen keinen Supabase-Mehrnutzerlauf. Aktuelle Nachweise und Testanleitung: [END_TO_END_AUDIT.md](END_TO_END_AUDIT.md). Ältere Testzahlen und Live-Nachweise darunter sind historisch.

Stand: 8. November 2026. Auf ausdrücklichen Folgeauftrag sind die Funktionen aus Phase B/C jetzt im Code umgesetzt. Es wird ein eigenes Supabase-Projekt verwendet; eine zweite Implementierung ist keine Voraussetzung mehr.

Tagesabschluss und nächste Sitzung: [SESSION_HANDOFF.md](SESSION_HANDOFF.md). Die folgenden Live-Nachweise stammen aus der vorausgehenden freigegebenen Einrichtung. Beim anschließenden Dokumentationsauftrag wurden keine Migrationen, Deployments oder Cloud-Änderungen ausgeführt.

**Aktueller Betriebszustand:** Das eigene Projekt **DeutschConnect - Codex Demo** (`gdwxitcwtzkyfspjfoiw`) ist lokal im Frontend konfiguriert. Nach Freigabe und persönlicher CLI-Anmeldung des Projektinhabers wurden die Migration, die Edge Function `platform` und die lokalen Auth-/Origin-Einstellungen erfolgreich im Cloud-Projekt eingerichtet. `.env.local` enthält nur die bereitgestellte Projekt-URL und den öffentlichen Publishable-Key und wird von Git ignoriert. Die Gastdemo und die vier Spiele bleiben nutzbar. Ein anderes Supabase-Projekt wurde nicht verändert; die Website selbst wurde nicht öffentlich bereitgestellt.

## Verbindungsprüfung vom 8. November 2026

Vites Umgebungsvariablen werden von `readBackendConfig` für das erwartete Projekt erkannt. Die Live-Abfrage von `/auth/v1/settings` mit dem öffentlichen Schlüssel antwortet mit HTTP 200: E-Mail-Anmeldung ist aktiviert, Registrierung ist erlaubt und automatische E-Mail-Bestätigung ist deaktiviert (ein Bestätigungslink ist erforderlich). Die anfangs fehlenden Tabellen und die Edge Function sind inzwischen eingerichtet. Die Function beantwortet den erlaubten CORS-Preflight mit HTTP 200 und weist anonyme sowie gefälschte Bearer-Tokens mit HTTP 401 zurück. Eine nicht erlaubte Origin erhält HTTP 403. Direkte öffentliche Lesezugriffe auf beide Tabellen und ein direkter Aufruf von `dc_commit` werden mit HTTP 401 / SQLSTATE `42501` abgewiesen.

Alle sieben Sicherheitsbedingungen wurden auf der Live-Datenbank unabhängig lesend bestätigt: RLS auf beiden Tabellen, kein anonymer Snapshot-Zugriff, keine Snapshot-Updates oder Befehlsprotokoll-Lesezugriffe für normale Konten und keine RPC-Ausführung für normale Konten; die Serverrolle darf den RPC ausführen. Die vorhandene pgTAP-Datei wurde ebenfalls auf der Live-Datenbank ausgeführt und ihre Testtransaktion zurückgerollt. Ein abschließender Konfigurationsvergleich zeigt keine Abweichungen bei den lokal deklarierten Eigenschaften; acht nicht deklarierte entfernte Einstellungen wurden ausdrücklich unverändert gelassen.

Unter **Mein Bereich → Anmelden** ist die Kontoseite jetzt direkt als zweiter Untertab erreichbar. Dort gibt es Anmelden, Registrieren und Bestätigung erneut senden. Der bisherige Einstieg über Profil & Einstellungen bleibt erhalten. Die Gastdemo funktioniert unabhängig von einem Konto.

Der Projektinhaber hat die echte Registrierung und den Empfang einer Bestätigungs-E-Mail selbst getestet. Die Live-Datenbank bestätigt ein Konto mit bestätigter E-Mail und einer Auth-Sitzung. Beim erneuten Öffnen des Links meldete Supabase `otp_expired`; bisher führte dieser Auth-Fehlerrücksprung auf eine 404-Seite. Der Fehler ist korrigiert: Auth-Fehlerrücksprünge führen zur Kontoseite mit einer übersetzten Erklärung und den vorhandenen Aktionen zum Anmelden oder erneuten Bestätigungsversand. Ungeprüfte URL-Fehlerbeschreibungen werden nicht angezeigt. Ein bereits gültiger, serverseitig geprüfter Zugang bleibt bei einem wiederverwendeten Link erhalten.

Der Projektinhaber hat inzwischen auch die normale passwortbasierte Anmeldung erfolgreich bestätigt. Die anschließende lesende Serverprüfung belegt genau einen Plattform-Workspace, ein echtes Profil und einen erfolgreich gespeicherten `bootstrap`-Befehl. Demo-Personas wurden nicht übernommen. Damit sind Auth-Prüfung, geschützter Edge-Aufruf und initiales Speichern über `dc_commit` auch im echten Ablauf belegt. Zum Sitzungsende bestätigte der Projektinhaber zusätzlich ausdrücklich den Sitzungserhalt nach Neuladen und die Abmeldung zurück zur Gastdemo einschließlich Demo-Profilumschalter. Der grundlegende persönliche Auth-Ablauf ist damit live abgenommen. Die manuelle Browsersteuerung wurde zuvor beendet, weil die aktuelle URL nicht zuverlässig bestimmt werden konnte; sie wurde nicht fortgesetzt. Die persönlichen Browsernachweise stammen vom Projektinhaber, der Postfach- und Passwortschritte selbst ausgeführt hat.

### Ausgeführte Cloud-Schritte

Die ausdrückliche Zustimmung liegt vor. Diese Änderungen ausschließlich im Projekt `gdwxitcwtzkyfspjfoiw` durchführen und den Zielprojektbezug vor jedem schreibenden Schritt prüfen:

1. Erledigt: Zielprojekt und fehlende Objekte lesend geprüft, Trockenlauf ausgeführt und `supabase/migrations/202611070001_platform.sql` mit Migrationshistorie angewendet. Tabellen `dc_workspace` und `dc_commands`, RLS, gesperrter Browserzugriff und RPC `dc_commit` sind vorhanden. Keine Seed-Daten, Rollen-Dateien, Vault-Werte oder Löschoperationen wurden ausgeführt.
2. Erledigt: Auth Site URL ist `http://127.0.0.1:5173`; die vier lokalen Redirect-Adressen (`http://127.0.0.1:5173`, `http://localhost:5173`, `http://127.0.0.1:4173`, `http://localhost:4173`) sind erlaubt. Mindestpasswortlänge ist zwölf Zeichen. E-Mail-Bestätigung bleibt eingeschaltet.
3. Erledigt: Edge Function `platform` einschließlich der drei Dateien aus `_shared/` über die Supabase-API bereitgestellt. `verify_jwt=false` ist gesetzt: Jeder Aufruf wird im Handler stattdessen über Supabase Auth `/user` geprüft und verlangt eine bestätigte E-Mail.
4. `DC_ALLOWED_ORIGINS` ist serverseitig auf die vier lokalen Origins begrenzt. Nach gesonderter ausdrücklicher Zustimmung zu Empfänger und Rechten wurde `DC_MODERATOR_IDS` für das bestätigte Betreiberkonto gesetzt. Dessen App-E-Mail wurde zuvor ohne Ausgabe persönlicher Werte mit der authentifizierten Supabase-Betreiberidentität abgeglichen; es gibt genau einen Treffer. Die Betreiberansicht und echte Gruppenbeiträge sind damit serverseitig freigeschaltet, aber noch nicht mit einer betreuten Gruppe live abgenommen. Die standardmäßigen `SUPABASE_*`-Servervariablen bleiben ausschließlich im Backend.
5. E-Mail-Versand prüfen. Ohne eigenen SMTP-Dienst liefert der Supabase-Standardversand nur an autorisierte Team-Adressen und ist stark limitiert; siehe [Supabase SMTP-Dokumentation](https://supabase.com/docs/guides/auth/auth-smtp). Zunächst mit der zum Supabase-Team gehörenden eigenen Adresse testen. Für weitere Schüleradressen braucht es einen abgestimmten Maildienst; dessen Zugangsdaten nur in Supabase hinterlegen.
6. Danach Sicherheitsprüfungen und einen echten Ablauf mit einer vom Projektinhaber kontrollierten Testadresse durchführen. Der Projektinhaber muss den Zugriff auf sein Postfach beziehungsweise eine erforderliche persönliche Anmeldung selbst übernehmen.

Die offizielle Supabase-CLI **3.0.0** liegt im ignorierten `.npm-cache/`; `package.json` und die React-Abhängigkeiten bleiben unverändert. Die persönliche CLI-Anmeldung `DeutschConnect-Codex` wurde vom Projektinhaber bestätigt. Sämtliche Cloud-Befehle nennen ausdrücklich `--remote=gdwxitcwtzkyfspjfoiw`; eine implizite Verknüpfung mit einem anderen Projekt wird nicht verwendet. Zugangstoken liegen ausschließlich im lokalen CLI-Anmeldespeicher, nicht in Frontenddateien. Anmeldelinks und kurzlebige Verifizierungscodes werden nicht in dieser Dokumentation gespeichert. Der öffentliche Frontend-Schlüssel reicht weiterhin nicht für administrative Änderungen.

Zusätzlich korrigiert: Auch erneut angeforderte Bestätigungs-E-Mails erhalten jetzt die aktuelle Frontend-Adresse als `redirect_to`. Eine automatische Rückleitung zu einer abweichenden Standardadresse wird damit vermieden, sofern die gewünschte Adresse in Supabase erlaubt ist. Neue Tests prüfen diesen Rücksprung sowie das Entfernen von URL-Tokens, die Identitätsprüfung und die Wiederherstellung der Sitzung nach einem Neuladen. Diese Tests verwenden simulierte Auth-Antworten und ersetzen keinen echten E-Mail-Test.

Aktueller lokaler Prüfstand: **83 Funktionstests bestanden**, 701 Übersetzungstexte je Sprache einschließlich Zeichenkodierung geprüft, 86 Demo-Routen je Persona und Sprache sowie konfigurierte/unverfügbare Kontoseiten, zwei Auth-Fehlerrücksprünge und 19 reale Kontoansichten je Sprache erfolgreich gerendert. Produktions-Build erfolgreich mit `npm.cmd run build -- --configLoader native`; Vite meldet einen nicht blockierenden Hinweis zum rund 501-kB-Hauptbundle. Die Auth-Unit-Tests verwenden Testantworten; der tatsächlich belegte Live-Prüfstand steht oben.

Die Kontoseite unterscheidet jetzt auch sprachlich zwischen passwortbasierter Anmeldung (verschickt keine E-Mail), Registrierung und erneutem Bestätigungsversand für noch nicht bestätigte Konten. Eine Versandbegrenzung (`over_email_send_rate_limit`) besitzt eine verständliche Meldung in allen drei Sprachen. Ein ausbleibender erneuter Bestätigungsversand für ein bereits bestätigtes Konto ist kein Nachweis eines fehlgeschlagenen Passwort-Logins. Der genaue Login-Prüfstand wird separat erfasst.

## Sofort lokal benutzen

```powershell
npm.cmd run dev -- --configLoader native --port 5173 --strictPort
```

Die ausgegebene lokale Adresse öffnen. Über **Community → Spiele** gibt es Schach, Brückenläufer, Papierflug und Symbolpaare. Schach funktioniert zu zweit an einem Gerät; zusätzlich lassen sich zwischen den fiktiven Profilen dieses Browsers Herausforderungen senden und annehmen. In der Gastdemo wird nichts auf andere Geräte übertragen. Die drei Einzelspiele brauchen kein Konto.

Für die Offline-Bereitstellung den Produktionsmodus verwenden:

```powershell
npm.cmd run build -- --configLoader native
npm.cmd run preview -- --configLoader native --port 4173 --strictPort
```

Unter Community → Spiele „Spiele offline bereitstellen“ wählen. Erst nach vollständiger Installation bestätigt die Oberfläche den Cache. Der Entwicklungsmodus bietet diese Schaltfläche nicht an, da Vites Entwicklungsdateien keine dauerhafte Offline-App sind. Ein automatisierter Test lädt die **tatsächlich gebauten Dateien** über den erzeugten Service Worker bei abgeschaltetem simuliertem Netzwerk. Eine echte Browser-/Smartphone-Offlinesitzung wurde hier nicht durchgeführt. Eine nie zuvor geladene Website ist dadurch nicht offline verfügbar. Konten, gemeinsame Beiträge und Online-Schach benötigen weiterhin eine Verbindung.

## Diagnose ohne Besucherhinweise

Ohne gültige Frontend-Konfiguration bleibt die Gastdemo nutzbar. Die Kontoseite zeigt nur eine kurze Meldung zur derzeit nicht verfügbaren Anmeldung und einen Rückweg zur Demo; sie enthält dann keine Eingabefelder. Dashboard und Gastmodule zeigen keine Einrichtungsanweisungen. Im Vite-Entwicklungsmodus meldet die Browserkonsole fehlende oder ungültige Konfiguration mit den benötigten Variablennamen und verweist auf diese Anleitung. Werte, Schlüssel und Sitzungstoken werden dabei nicht protokolliert. Im Produktions-Build entfällt diese Diagnose.

Geprüft nach dieser Anpassung: 79 Funktionstests, Übersetzungen und Zeichenkodierung (696 Texte je Sprache), automatisches Rendern von 86 Demo-Routen je Profil/Sprache sowie Kontoseiten mit und ohne konfigurierte Verbindung. Produktions-Build erfolgreich mit `npm.cmd run build -- --configLoader native`; der Standard-Konfigurationsloader scheiterte in dieser Windows-Umgebung an eingeschränkten Verzeichnisrechten. Diese Prüfungen ersetzen keine manuelle Browser-Abnahme und keine Live-Anmeldung.

## Einmalige Einrichtung des eigenen Projekts

Die Schritte 1–4 einschließlich der gesondert genehmigten Betreiberberechtigung sind erledigt; diese Anleitung bleibt für die Wartung erhalten. Supabase CLI 3.0.0 ist im ignorierten npm-Cache verfügbar; Docker/PostgreSQL sind nicht installiert. Migrationen, SQL-Tests und Funktionsbereitstellung wurden über den Remote-Zugriff ausgeführt. Für die Frontend-Anbindung werden keine neuen Bibliotheken benötigt.

1. Das bereits erstellte Projekt **DeutschConnect - Codex Demo** (`gdwxitcwtzkyfspjfoiw`) im [Supabase Dashboard](https://supabase.com/dashboard/project/gdwxitcwtzkyfspjfoiw) verwenden. Kein zweites Projekt anlegen. Datenbankpasswort sicher außerhalb von Chat und Frontend verwahren.
2. Für Supabase Auth E-Mail-Anmeldung und **E-Mail-Bestätigung** aktivieren. Versand/SMTP für die vorgesehenen Testadressen einrichten und die geltenden Versandlimits prüfen. Als Site URL zunächst die tatsächlich verwendete lokale Adresse eintragen, zum Beispiel `http://127.0.0.1:5173`. Dieselben Adressen in der Redirect-Allowlist zulassen. Produktionsadressen später ausdrücklich ergänzen.
3. Bereits lokal erledigt: `.env.local` enthält die Projekt-URL und den **öffentlichen Publishable-Key**. Generisches Format für spätere Entwicklungsumgebungen:

```dotenv
VITE_SUPABASE_URL=https://DEIN-PROJEKT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=DEIN_OEFFENTLICHER_PUBLISHABLE_KEY
```

Ein vorhandener öffentlicher Legacy-Anon-Key wird alternativ als `VITE_SUPABASE_ANON_KEY` unterstützt. Niemals Service-Role-Key, `sb_secret_*` oder Datenbankpasswort in eine `VITE_*`-Variable schreiben. Die Konfigurationsprüfung lehnt erkennbare privilegierte Schlüssel ab.

4. Für spätere Wartung mit der bereits vorhandenen Konfiguration arbeiten; **nicht erneut das Projekt erzeugen oder bestehende Dateien überschreiben**. Die CLI-Version ist auf 3.0.0 festgelegt. Die folgenden Befehle nennen das Zielprojekt ausdrücklich und wurden für die erste Einrichtung bereits ausgeführt:

```powershell
npx.cmd supabase@3.0.0 config diff --remote=gdwxitcwtzkyfspjfoiw
npx.cmd supabase@3.0.0 db push --remote=gdwxitcwtzkyfspjfoiw --skip-vault --dry-run
npx.cmd supabase@3.0.0 db push --remote=gdwxitcwtzkyfspjfoiw --skip-vault --yes
npx.cmd supabase@3.0.0 config push --remote=gdwxitcwtzkyfspjfoiw --yes
npx.cmd supabase@3.0.0 functions deploy platform --remote=gdwxitcwtzkyfspjfoiw --use-api --no-verify-jwt --yes
```

Schreibende Befehle ändern das eigene Cloud-Projekt und benötigen eine entsprechende Freigabe. Die erste Einrichtung ist erfolgt; eine erneute Ausführung ist für die Benutzung nicht notwendig. CLI-Grundlagen beschreibt die [offizielle CLI-Anleitung](https://supabase.com/docs/guides/local-development/cli/getting-started); das Bereitstellen einer Funktion die [Supabase-Anleitung](https://supabase.com/docs/guides/functions/deploy).

5. Zunächst ein verantwortliches Betreiberkonto registrieren und dessen E-Mail bestätigen. Seine Benutzer-UUID im Supabase-Auth-Bereich nachsehen. Diese ID als Betreiberkonfiguration setzen, nicht als frei wählbares Profilfeld:

```powershell
npx.cmd supabase@3.0.0 secrets set --remote=gdwxitcwtzkyfspjfoiw DC_MODERATOR_IDS=UUID_DES_BETREIBERKONTOS --yes
npx.cmd supabase@3.0.0 secrets set --remote=gdwxitcwtzkyfspjfoiw DC_ALLOWED_ORIGINS=http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:4173,http://localhost:4173 --yes
```

Die automatisch bereitgestellten Supabase-Variablen `SUPABASE_URL`, `SUPABASE_ANON_KEY` und `SUPABASE_SERVICE_ROLE_KEY` werden **nur in der Edge Function** verwendet. Sie werden nicht in Browserdateien kopiert. Bei mehreren Moderatoren werden IDs kommasepariert konfiguriert. Ohne eingerichtete Moderation lehnt der Server echte Gruppenbeiträge ab.

6. Den Vite-Server nach Änderungen an `.env.local` neu starten. Für eine feste lokale Adresse:

```powershell
npm.cmd run dev -- --configLoader native --port 5173 --strictPort
```

7. Nach vollständiger Einrichtung über **Mein Bereich → Anmelden → Registrieren** ein eigenes Testkonto anlegen und dessen Bestätigungs-E-Mail öffnen. Der bisherige Weg über Profil & Einstellungen → Gastmodus & Konto bleibt nutzbar. Nach Bestätigung des E-Mail-Links wird die Sitzung mit dem Auth-Server geprüft. Im echten Konto verschwinden Demo-Umschalter und Demo-Kennzeichnungen. Das Profil zuerst um die eigene Schule ergänzen; Schulangaben sind zunächst selbst angegeben und werden nicht als institutionell geprüft dargestellt.

## Reale Nutzerabläufe nach erfolgreicher Verbindung

- Eigene Projekte und Nachhilfeeinträge werden auf dem Server gespeichert und für berechtigte Nutzer anderer Geräte sichtbar. Fremdes Eigentum kann nicht über die Oberfläche oder manipulierte Befehle übernommen werden.
- Bei Projekten sind Interesse, Anfrage und angenommene Mitgliedschaft getrennt. Eigentümer öffnen eine Projektgruppe; deren Zugang folgt den tatsächlichen Mitgliedschaften. Austritt entzieht den Gruppenzugang.
- Events lassen sich vorschlagen. Ein Moderator gibt sie für Anmeldungen frei. Eine Anmeldung gewährt noch keinen Anwesenheitsnachweis. Eigentümer können für freigegebene Events eine Gruppe öffnen; Zugang folgt der Anmeldung.
- Themenräumen tritt man freiwillig bei. Beiträge bleiben dauerhaft auf dem Server und werden nur an Mitglieder bzw. verantwortliche Moderatoren ausgeliefert. Die Ansicht aktualisiert sich **alle vier Sekunden**. Es ist bewusst Polling und kein bereits behaupteter WebSocket-Dienst.
- Profilfreigabe bleibt freiwillig. Ein Projektantrag oder eine gemeinsame Gruppe kann den Anzeigenamen den Beteiligten zeigen, ohne das vollständige Profil in das Verzeichnis aufzunehmen. E-Mail-Adressen erscheinen nur im eigenen Kontobereich.
- Blockieren blendet Profile, Angebote und Beiträge aus und unterbindet Schachherausforderungen zwischen den Betroffenen. Blockierungen lassen sich unter Community → Meine Aktivitäten aufheben. Moderatoren können gemeldete Inhalte weiterhin prüfen.
- Meldungen erreichen den serverseitigen Moderationsbereich. Moderatoren können Inhalte entfernen und Meldungen als geprüft markieren. Ein gesetzter Moderator ist nicht gleichbedeutend mit rund um die Uhr besetzter Moderation; Verantwortlichkeiten und Bearbeitung müssen organisatorisch gewährleistet sein.
- Online-Schach benötigt die freiwillige Annahme einer Herausforderung. Nur die beiden Spieler dürfen Züge senden. Der Server rekonstruiert die Partie aus der Zugfolge und prüft Zugrecht, Legalität und Revision. Nach einem Verbindungsabbruch wird der gespeicherte Stand geladen; es gibt weder automatische Niederlage wegen eines kurzen Abbruchs noch eine Schachuhr.
- Auszeichnungen werden nicht für Anmeldung, Klicks oder Spiele vergeben. Der Moderator bestätigt Anwesenheit nach einem freigegebenen Termin. Die implementierte Anerkennung für schulübergreifende Zusammenarbeit erfordert bestätigte Teilnahmen aus zwei angegebenen Schulen. Auszeichnungen bleiben standardmäßig privat und können freiwillig geteilt werden. Keine Ranglisten, Login-Serien oder künstlicher Nutzungsdruck.

## Architektur und Rechte

`src/services/supabase.js` kapselt die dokumentierten Auth-/REST-Endpunkte: Registrierung, Bestätigungsversand, Anmeldung, verifizierte Identität, Token-Erneuerung und Abmeldung. Es wird keine eigene Passwortprüfung oder Kryptografie implementiert. Passwörter werden nicht gespeichert. Sitzungs-Token werden als SPA-Sitzung im Browser gehalten; bei blockiertem Speicher nur im Arbeitsspeicher. Ein fiktives Profil oder localStorage-Flag reicht niemals als Identitätsnachweis. Gastdaten werden nicht automatisch in ein echtes Konto übernommen.

`AccountContext` trennt Benutzerwechsel, verwirft veraltete Antworten, schützt Wiederholungen von unklar beantworteten Befehlen und erneuert sichtbare Daten. Kontobezogene Session-Entwürfe werden beim Benutzerwechsel entfernt. Lang laufende Bearbeitungen besitzen weiterhin Konfliktprüfung. Anlageformulare behalten beim Wiederholen dieselbe Datensatz-ID, damit ein Timeout keine unbemerkte zweite Anlage erzeugt.

`supabase/functions/platform/index.ts` prüft **jede** Anfrage über Supabase Auth `/user`, verlangt eine bestätigte E-Mail und leitet den handelnden Benutzer ausschließlich aus dieser Prüfung ab. `verify_jwt = false` in der Funktionskonfiguration schaltet diese eigene Prüfung nicht ab; es vermeidet die zusätzliche ältere Gateway-Prüfung vor der kontrollierten Auth-Abfrage. Clientseitige `actorId`-/Rollenangaben vermitteln keine Rechte.

Das MVP speichert den gemeinsamen fachlichen Zustand privat in `dc_workspace` und eine Befehls-ID-Historie in `dc_commands`. Beide Tabellen haben RLS und keine direkten Lese-/Schreibrechte für `anon` oder `authenticated`. Ausschließlich die geprüfte Funktion verwendet die Serverrolle. `dc_commit` sperrt und vergleicht die Revision atomar, erfasst ausgeführte Befehle und verhindert verlorene konkurrierende Schreibzugriffe. Bei Konflikten liest die Funktion erneut; alte Formulare werden nicht still übernommen.

Die serverseitige Projektion entfernt fremde private Entwürfe, unberechtigte Gruppenbeiträge, fremde Anwesenheitsnachweise und nicht freigegebene Auszeichnungen. Meldeinformationen sind auf Melder und Moderatoren begrenzt. Öffentliche Textfelder prüfen zusätzlich übliche Kontaktangaben und Links. Diese Heuristik ersetzt keine Moderation und erkennt nicht jede verschleierte persönliche Angabe.

Das private JSON-Modell ist eine bewusste, kleine MVP-Lösung. Es eignet sich für einen begrenzten Pilot, nicht für beliebig große Nachrichtenmengen oder viele gleichzeitig schreibende Schulen. Vor größerem Betrieb werden fachliche Tabellen, Pagination, Aufbewahrung/Löschung, Backups und Lasttests benötigt. Entfernte Projekte/Nachhilfe werden derzeit als Löschmarkierungen gehalten; endgültige Löschung und Auth-Kontolöschung brauchen einen abgestimmten Betreiberprozess. Ein Code- und Sicherheitstest ersetzt die organisatorische Prüfung für minderjährige Nutzer nicht.

## Spiele und Offline-Dateien

`supabase/functions/_shared/chess.js` ist eine gemeinsame, unabhängig testbare Regellogik für Browser und Server. Die ursprünglich vorgesehenen Bibliotheken konnten wegen DNS-Fehlern nicht installiert werden; es wurden keine unvollständigen Laufzeitimporte oder extern benötigten CDN-Skripte ergänzt. Die Logik prüft Standardzüge, Selbstschach, Rochade, en passant, alle Umwandlungen, Matt/Patt sowie behandelte Remisregeln. Dreifache Wiederholung/50 Züge sind beanspruchbar, fünffache Wiederholung/75 Züge automatisch. Die Anwendung ist kein Turnier-Schiedsrichtersystem; komplexe tote Stellungen und ein Remisanspruch vor einem noch nicht ausgeführten beabsichtigten Zug sind nicht vollständig abgedeckt.

Runner und Papierflug verwenden eigene SVG-Grafiken und reine Physikmodelle. Tippen, Leertaste und Pfeil nach oben steuern; Pause, Neustart und automatisches Pausieren beim Verlassen des Tabs sind vorhanden. Symbolpaare funktioniert ohne Zeitlimit und unterstützt normale Tastaturbedienung. Bestwerte werden nur lokal gespeichert. Keine übernommenen Spielgrafiken, Werbung oder Käufe.

`scripts/offline-build.mjs` erzeugt einen versionierten Service Worker und `offline-manifest.json`. Nur statische App-/Spieldateien werden gespeichert. API-Pfade, fremde Herkunft, POST-Anfragen und Anfragen mit Authorization-Header werden nicht aus diesem Cache beantwortet. Ein App-Cache ist keine Sicherung von Kontodaten. Es wird keine native App oder vollständig installierbare PWA behauptet.

## Prüfung und noch offene Abnahme

```powershell
npm.cmd test
npm.cmd run check
npm.cmd run check:render
npm.cmd run build -- --configLoader native
npm.cmd run check:offline
node --check supabase/functions/platform/index.ts
```

Geprüft werden bestehende Module, Wiederherstellung, persönliche Zählungen, Schach-Zugbaumreferenzen und Sonderzüge, Einladungen/Zugrecht, Arcade-Physik, Backend-Besitzprüfungen, Gruppenrechte, Blockieren, Moderation, bestätigte Auszeichnungen sowie Auth-Aufrufe gegen Testantworten. Die Renderprüfung schließt echte Kontozustände ohne Demo-Kennzeichnung und aktive Schachbretter in allen drei Sprachen ein. Der Offline-Test schaltet den simulierten Netzwerkzugriff für die tatsächlichen Build-Dateien ab.

Zum Tagesabschluss erneut ausgeführt: **83 automatisierte Tests bestanden**, **701 Übersetzungseinträge je Sprache geprüft**, sämtliche Renderprüfungen einschließlich 86 Demo-Routen je Persona/Sprache, zusätzlicher Konto-/Recovery-Zustände und Schachbretter erfolgreich. **Produktions-Build und Edge-Function-Syntaxprüfung erfolgreich**. Der Offline-Test lieferte alle **fünf erforderlichen Build-Ressourcen** mit abgeschaltetem simuliertem Netz aus. Vite meldet eine nicht blockierende Warnung zum ca. 501-kB-Hauptbundle. Frühere HTTP-Prüfungen bestätigten die lokale Website-Erreichbarkeit; beim Tagesabschluss wurde kein weiterer Server gestartet. Branch: `codex-version-1.0`.

In der vorausgehenden Einrichtung live ausgeführt: SQL-Migration, `supabase/tests/security.sql`, unabhängige Rechteprüfungen, Cloud-Edge-Deployment, Moderationszuordnung und öffentliche API-/CORS-Prüfungen. Registrierung, E-Mail-Empfang, bestätigter Auth-Status, Passwort-Anmeldung und geschützter Plattformstart sind für das eigene Betreiber-Testkonto belegt; Neuladen und Abmeldung wurden anschließend ebenfalls vom Projektinhaber bestätigt. Noch offen sind die Zwei-Konten-/Zwei-Geräte-Abnahme der inhaltlichen Zusammenarbeit und die interaktive Smartphone-Prüfung. Vor weiteren echten Schülerdaten müssen Tests mit zwei geprüften Testkonten und einer betreuten Testgruppe erfolgen. Die Auth-/Backend-Unit-Tests allein sind kein Beleg für funktionierenden Cloudbetrieb.

Ein lokaler Supabase-Docker-Stack und `supabase test db` wurden nicht eingerichtet beziehungsweise ausgeführt. Die vorhandene pgTAP-Datei wurde stattdessen bereits über den Remote-SQL-Zugriff transaktional auf dem eigenen Cloud-Projekt ausgeführt; siehe Nachweise oben. Vollständige End-to-End-Tests der gemeinsamen Module bleiben offen.

## Betroffene Dateien

Neu: `supabase/config.toml`, Migration, pgTAP-Test, Edge Function und gemeinsame Backend-/Schachlogik unter `supabase/`; `src/services/supabase.js`, `src/state/AccountContext.jsx`, `src/games/*`, `src/pages/Games.jsx`, `Account.jsx`, `EventNew.jsx`, `Achievements.jsx`, `Moderation.jsx`, `src/components/ActionButton.jsx`, `AccountStatus.jsx`, `src/i18n/accountCopy.js`, drei `locales/platform`-Dateien, `styles/games.css`, `.env.example`, ignorierte `.env.local`, Backend-/Spieltests sowie Offline-Build-/Testskripte.

Gezielt angepasst: bestehender Daten-Context, Routing, persönliche Seiten, Eventlisten/-details, Projekt-/Nachhilfedetails, Community und Karten, Entwurfsverwaltung, Übersetzungsprüfung, Renderprüfung, Vite-Konfiguration und Dokumentation. Die bestehenden Module und lokalen Daten bleiben erhalten. Die Backend-Function wurde mit Freigabe im eigenen Projekt bereitgestellt; keine Git-Commits, Git-Pushes oder öffentliche Website-Veröffentlichung. Der Tagesabschluss betrifft ausschließlich Dokumentation und lokale Prüfungen.
