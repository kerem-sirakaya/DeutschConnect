# E-Mail-Bestätigung und getrennte Konten

Stand: 8. November 2026. Auftrag: Fehler nach dem Gmail-Bestätigungslink untersuchen und innerhalb der vorhandenen React-/Supabase-Architektur korrigieren. Keine Migration, Cloud-Konfigurationsänderung, Bereitstellung, Commits oder Pushes für diesen Auftrag.

## Ursachen und belegbarer Stand

**Nachgewiesener Konfigurationsblocker für andere Geräte:** Der Projektinhaber bestätigt, dass der Link auf einem anderen Handy/Computer geöffnet wurde. Die lesend abgerufene Konfiguration des eigenen Projekts `gdwxitcwtzkyfspjfoiw` verwendet ausschließlich Loopback-Adressen:

- Site URL: `http://127.0.0.1:5173`
- Redirect URLs: `http://127.0.0.1:5173`, `http://localhost:5173`, `http://127.0.0.1:4173`, `http://localhost:4173`
- E-Mail-Bestätigung aktiviert; Mindestpasswortlänge zwölf Zeichen.

`localhost` und `127.0.0.1` bezeichnen immer das Gerät, auf dem der Link geöffnet wird. Diese Konfiguration kann daher keine zuverlässige Rückleitung zur Anwendung auf einem anderen Gerät herstellen. Eine geänderte Browsermeldung allein löst das nicht. Ein funktionierender Link für andere Geräte benötigt eine dort erreichbare Website-Adresse und passende erlaubte Redirects/Origins.

**Weitere tatsächlich reproduzierte Clientfehler:** Die alte Initialisierung konnte Tokens eines Bestätigungslinks vor der Identitätsprüfung über die bestehende Sitzung schreiben. Ein paralleler Aufruf konnte eine noch laufende Prüfung als fertig behandeln. Netzwerkfehler bei der Initialisierung wurden teilweise verschluckt. Bei bestätigter Identität, aber fehlendem Plattformprofil blockierte die Oberfläche mit lediglich Wiederladen/Abmelden. Diese Fehler wurden gezielt korrigiert und durch Regressionen abgesichert.

**Live-Befund, nur aggregiert:** Zwei Auth-Konten, beide E-Mails bestätigt; zum Prüfzeitpunkt keine Auth-Sitzung; ein Plattformprofil, ein bestätigtes Konto ohne Plattformprofil. Ein gespeicherter Bootstrap-Befehl, kein Bootstrap ohne zugehöriges Profil. Workspace-Typen und Serverrollen-Schemazugriff waren gültig. Ein fehlendes Profil wird beim ersten erfolgreichen authentifizierten Plattformaufruf angelegt, nicht allein durch E-Mail-Bestätigung. Die Zahlen beweisen keinen erfolgreichen Login des Freundes und lassen keine sichere Zuordnung des fehlenden Profils zu einer Person zu.

Der konkrete fehlgeschlagene HTTP-Aufruf des Freundes wurde nicht wiedergewonnen. Die vorhandene Auth-Audit-Abfrage enthielt im untersuchten Zeitraum keine Einträge; die verfügbare CLI bietet keinen Function-Logs-Befehl. Deshalb lässt sich der damalige Profilfehler nicht abschließend einem bestimmten Serverfehler zuordnen. Der Loopback-Blocker erklärt insbesondere nicht für sich allein, weshalb ein bereits geladener Browser den Profil-Ladebildschirm zeigte. Dafür wurde der tatsächliche Fehlerzustand separat lokal reproduziert.

## Verhalten nach der Korrektur

1. Auth-Fragmente und Auth-Queryparameter werden **vor React und Hash-Routing** einmal erfasst und aus der URL entfernt. Tokens gelangen nicht in Navigationsmetadaten, Meldungen oder Testberichte.
2. Gleichzeitige Initialisierungen warten auf dasselbe Promise. Ein Callback wird unabhängig von einer gespeicherten Sitzung über Supabase `/auth/v1/user` geprüft; nur bestätigte Identitäten dürfen weiter.
3. Ist Konto A angemeldet und gehört der Link zu Konto B, bleibt A erhalten. Ein sichtbarer Hinweis bietet ausdrücklich den Wechsel zu B oder das Beibehalten von A an. Erst nach Zustimmung und erneuter Prüfung wird B übernommen.
4. Eine nachweislich bestätigte E-Mail ohne Sitzung erzeugt eine Bestätigungsmeldung mit regulärer Passwortanmeldung. Ein bloßes `type=signup` oder ein unverifizierter URL-Code gilt nicht als erfolgreiche Bestätigung. Fremde PKCE-Codes werden ohne passenden Verifier nicht als Login ausgegeben.
5. Nach gültigem Login wird das eigene Plattformprofil geladen. Der Wechsel von der Kontoseite zu `#/me` erfolgt erst, wenn Identität, `activeId` und eigenes Profil übereinstimmen. Bei bewusstem Weiterblättern wird keine andere Seite überschrieben.
6. Fehlt das Plattformprofil wegen eines Ladefehlers, zeigt die Wiederherstellung den getrennten Auth-/Profilstatus, eine verständliche Meldung und nur einen bereinigten Fehlercode/HTTP-Status. Profil erneut laden und regulär anmelden sind möglich; eine Abmeldung wird nicht erzwungen. Andere Kontodaten und Demo-Personas werden nicht als Ersatzprofil eingesetzt.
7. Ungültige, unvollständige, abgelaufene oder erneut verwendete Links bieten Anmeldung beziehungsweise erneuten Bestätigungsversand. Eine gültige bestehende Anmeldung bleibt erhalten. Temporäre Netzfehler lassen sich im selben Tab erneut prüfen, ohne Tokens wieder in die URL zu schreiben.
8. Sitzungswiederherstellung, Refresh, serverseitige Rechteprüfung und Trennung der Kontodaten bleiben bestehen. Es gibt keine Passwortspeicherung in der App und keine neue Auth- oder Datenbankarchitektur.

## Betroffene Dateien dieses Auftrags

| Bereich | Dateien | Zweck |
| --- | --- | --- |
| Callback und Sitzung | `src/services/authCallback.js` (neu), `src/services/supabase.js`, `src/main.jsx` | Frühe Erfassung, unabhängige Identitätsprüfung, expliziter Kontowechsel, sichere Wiederholung |
| Profil und Weiterleitung | `src/state/AccountContext.jsx`, `src/state/DemoContext.jsx` | Profil-/Auth-Stufen, geprüfte Dashboard-Weiterleitung, Wiederherstellung |
| Oberfläche | `src/components/AccountRecovery.jsx` und `ConfirmationNotice.jsx` (neu), `src/pages/Account.jsx`, `src/App.jsx` | Verständliche Bestätigung, Kontowahl und Anmeldung statt Sackgasse |
| Sprachen | `src/locales/platform/de.json`, `tr.json`, `en.json` | Vollständige Meldungen in DE/TR/EN |
| Regressionen | `scripts/auth-confirmation.test.mjs` (neu), `scripts/check-render.mjs`, `tests/e2e/backend.js`, `tests/e2e/local.spec.js` | Sitzungen, Callback, Profilfehler, getrennte Browser, Reload und Sprachansichten |
| Dokumentation | diese Datei, `README.md`, `docs/SESSION_HANDOFF.md`, `docs/SUPABASE-SETUP.md` | Ursachen, Nachweise und verbleibende Einrichtung |

Weitere bereits vorhandene uncommittete Änderungen stammen aus früheren Aufträgen und wurden erhalten. Backend-Quelldateien bleiben für diesen Auftrag unverändert; die zuvor genehmigte Function-Version 3 bleibt aktiv.

## Erforderliche Einrichtung im eigenen Supabase-Projekt

Noch nichts davon geändert. Es fehlt eine bestätigte, auf beiden Geräten erreichbare Basisadresse. Die folgenden Werte sind **Platzhalter**, keine existierende Veröffentlichung: `BASIS` steht für die später vereinbarte vollständige HTTPS-Adresse einschließlich eines eventuellen Unterpfads und abschließendem `/` für den App-Einstieg.

1. Eine erreichbare Adresse für die vorhandene Website festlegen und getrennt freigeben. Zunächst dort prüfen, dass DeutschConnect auf beiden Geräten ohne Anmeldelink lädt. Kein Gerät kann den Entwicklungsserver des anderen über dessen `127.0.0.1` erreichen.
2. Ausschließlich **DeutschConnect - Codex Demo** (`gdwxitcwtzkyfspjfoiw`) öffnen → **Authentication → URL Configuration**. **Site URL** auf den konkreten Wert von `BASIS` setzen. Unter **Redirect URLs** denselben App-Einstieg exakt erlauben; keine beliebigen Wildcards. Lokale Entwicklungsadressen nur bei weiter bestehendem Bedarf beibehalten. Die App sendet bei Registrierung/erneutem Versand `location.origin + location.pathname` als `redirect_to`, ohne Hash-Routen.
3. Die **Origin** dieser Adresse (nur Protokoll, Host und ggf. Port, ohne Pfad/Slash) nach gesonderter Freigabe in `DC_ALLOWED_ORIGINS` der Function ergänzen. Sonst kann eine erfolgreiche Auth-Anmeldung noch am CORS-Schutz der Profildaten scheitern. Bestehende lokale Origins bei Bedarf erhalten, keine Secrets in Vite übernehmen.
4. **Authentication → Email Templates → Confirm signup** prüfen: Für den bestehenden Standardablauf muss der Bestätigungsbutton `{{ .ConfirmationURL }}` verwenden. Ein Link nur zu `{{ .SiteURL }}` bestätigt keine E-Mail. Ein bewusst angepasstes Token-Hash-Template benötigt stattdessen einen passenden Verifizierungsablauf. Das tatsächlich aktive HTML-Template wurde mit `config pull` nicht mitgeliefert und wurde daher **nicht live verifiziert**. Nicht ungeprüft ein vorhandenes angepasstes Template überschreiben.
5. **Authentication → Providers → Email**: Bestätigung eingeschaltet lassen. Bei ausbleibendem Versand zusätzlich Versanddienst, erlaubte Empfänger und Rate-Limits im eigenen Projekt prüfen. Dieser Auftrag richtet keinen Mailanbieter ein.
6. Neue Registrierung beziehungsweise bei noch unbestätigtem Konto einen neuen Link von der richtigen Basisadresse anfordern. Bereits versandte Links nicht als aktualisiert betrachten. Ist die E-Mail bereits bestätigt, direkt mit Passwort anmelden.

Offizielle Grundlagen: [Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls), [E-Mail-Templates und ConfirmationURL](https://supabase.com/docs/guides/auth/auth-email-templates), [Implicit Flow mit Tokens im Fragment](https://supabase.com/docs/guides/auth/sessions/implicit-flow), [PKCE und browsergebundener Verifier](https://supabase.com/docs/guides/auth/sessions/pkce-flow). Der bestehende Raw-REST-Signup verwendet keinen PKCE-Verifier. Ein Gerätewechsel wird durch echte Token-/OTP-Prüfung beziehungsweise nachfolgende Passwortanmeldung unterstützt, nicht durch eine erfundene Sitzung.

## Prüfungen und verbleibende Abnahme

Lokale Browserprüfungen verwenden die echte React-Oberfläche und den produktiven Plattform-HTTP-Handler, aber ausdrücklich simulierte Auth-/SQL-Antworten und synthetische Bestätigungslinks. Sie sind kein Nachweis einer zugestellten Gmail-Nachricht oder eines echten Supabase-Logins auf zwei physischen Geräten.

Bereits erfolgreich geprüft:

- `npm.cmd test`: **147/147** Unit-/HTTP-Integrationstests, davon neun neue gezielte Auth-Regressionsfälle. Die Erstfassung der Regressionen reproduzierte mehrere bisherige Fehler; ein zusätzlich geprüfter OTP-Fehler und eine falsche Dashboard-Weiterleitung ohne neue Sitzung wurden ebenfalls zunächst rot und anschließend korrigiert.
- `npm.cmd run check`: **819** nichtleere Texte je DE/TR/EN, identische Schlüssel und gültige Zeichenkodierung.
- `npm.cmd run check:render`: 87 Routen pro Demo-Persona/Sprache, aufgelöste erzeugte Links, bestehende Konto-/Spielansichten und zusätzlich fünf Bestätigungs-/Kontowahl-/Profil-Ladezustände je Sprache erfolgreich.
- `npm.cmd run build -- --configLoader native`: 133 Module, Haupt-JS **561,98 kB / gzip 172,24 kB**. Die bestehende nicht blockierende Warnung über 500 kB bleibt.
- `npm.cmd run check:offline`: fünf gebaute Ressourcen bei deaktiviertem Netz; private/API-Anfragen vom Cache ausgeschlossen.
- `npm.cmd run test:e2e`: **52/52** lokale Browsertests erfolgreich, **26 Desktop + 26 Pixel-7-Emulation**, ohne Retries. Vollständiger abschließender Lauf nach den Korrekturen; die bestehenden Module bleiben enthalten.
- `git diff --check`: keine Whitespace-Fehler. Arbeitsbranch und HEAD unverändert, Backenddateien ohne Änderungen dieses Auftrags.

Die Szenarien decken neue Konten in getrennten Kontexten, Passwortlogin im ursprünglichen Registrierungsbrowser, explizite Kontowahl, Reload, ungültige/erneut verwendete Links, Code ohne Verifier, Netzfehler und fehlendes Profil mit Wiederherstellung ab. Die vorhandenen Projekt-/Event-/Nachhilfe-/Community-/Schach-/Spielprüfungen bleiben enthalten. Ein anderer physischer Rechner und ein echtes Gmail-Postfach sind damit nicht simuliert als live abgenommen ausgegeben.

Manuell noch erforderlich, nachdem Adresse und Konfiguration eingerichtet wurden:

- Zwei dedizierte fiktive Testpersonen mit getrennten Postfächern/Browsern registrieren, Mail erhalten, Link öffnen, eigene Identität und Profil prüfen. Passwörter/Tokens/Links niemals im Bericht speichern.
- Registrierung am Laptop, Bestätigung auf anderem Handy/Computer, anschließend Passwortlogin im ursprünglichen Browser und Reload prüfen. Beide Geräte müssen die gleiche erreichbare Website verwenden.
- Während Konto A angemeldet ist, Link für B öffnen; erst „beibehalten“, dann mit einem frischen Link ausdrücklich wechseln. Kein fremdes Profil, keine ungefragte Abmeldung.
- Link erneut öffnen und abgelaufenen Link prüfen. Bereits bestätigte Adresse muss über Passwortlogin weiter nutzbar bleiben.
- Bei weiter fehlendem Profil ausschließlich Zeitpunkt, HTTP-Status und bereinigten Fehlercode aus der Wiederherstellung notieren; im eigenen Supabase-Dashboard Auth-/Function-Logs dazu prüfen. Keine Authorization-Header oder vollständigen Callback-Adressen teilen.

**Abnahmegrenze:** Lokale Fehlerkorrektur und Regressionen sind getrennt von der noch offenen echten E-Mail-/Zwei-Geräte-Abnahme zu bewerten. Die frühere vom Projektinhaber bestätigte Einzelkonto-Anmeldung ersetzt diese neue Abnahme nicht.
