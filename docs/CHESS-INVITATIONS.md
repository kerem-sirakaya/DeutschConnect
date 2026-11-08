# Schacheinladungen und Benachrichtigungen

Stand: 8. November 2026. Auf dem bestehenden Branch `codex-version-1.0` umgesetzt. Keine Commits, Pushes, Deployments, Migrationen, Anbieterregistrierung oder E-Mail-Sendungen.

## Was bereits bestand

Die Anwendung speicherte Herausforderungen unter `modules.challenges`. Nur der eingeladene Spieler durfte annehmen oder ablehnen; nur der Absender durfte zurückziehen. Bei Annahme entstand genau eine gemeinsame Partie mit ID `<Einladungs-ID>-game`. Der Empfänger konnte dies bislang nur in der Schach-Lobby entdecken. Eine appweite Benachrichtigungsanzeige und Einladungs-E-Mails gab es nicht.

Echte Konten verwenden bereits den Supabase-Workspace und eine gefilterte Benutzersicht. Die sichtbare Anwendung lädt ungefähr alle vier Sekunden nach und aktualisiert beim Zurückkehren in den Tab. Die Auth-E-Mails für Registrierung/Bestätigung sind ein anderer Ablauf; sie sind kein Versanddienst für Spieleinladungen. Ein eigener Versanddienst für Einladungen ist nicht eingerichtet.

Der Projektinhaber hat für diesen Auftrag ausdrücklich gewählt: **Website-Benachrichtigungen umsetzen und die E-Mail-Anbindung vorbereiten, ohne einen neuen Anbieter einzurichten.**

## Jetzt umgesetzt

- Eine Glocke mit Ungelesen-Zahl ist in allen Hauptbereichen erreichbar. Ein kompakter Hinweis auf ungelesene Einladungen/Antworten führt zur zentralen Übersicht; die Übersicht wiederholt diesen Hinweis nicht nochmals.
- Die zentrale Route lautet `#/me/notifications`. Dort stehen eingegangene Einladungen, wartende eigene Einladungen, Annahmen, Ablehnungen und Rücknahmen.
- **Annehmen und spielen** verwendet den bestehenden geprüften Annahmebefehl und öffnet direkt die zugehörige gemeinsame Partie.
- Der Einladende erhält bei Annahme einen Hinweis mit **Zur gemeinsamen Partie**. Beide Seiten gelangen zu derselben Partie; ein zweiter Annahmeversuch erzeugt keine zweite Partie.
- Ablehnen und Zurückziehen bleiben möglich. Blockierungen wirken in beide Richtungen auf Anzeige und Annahme.
- Die Schach-Lobby sendet Einladungen und zeigt eine Speicherbestätigung sowie den Weg zur zentralen Übersicht. Bei unklar beantworteten Wiederholungen bleibt die Einladungs-ID stabil.
- Der Schach-Link eines tatsächlich vorhandenen freigegebenen Profils wählt den gewünschten Gegner vor. Nicht vorhandene oder nicht mehr verfügbare Ziele werden nicht stillschweigend durch eine andere Person ersetzt. Das zusätzliche fiktive Verzeichnisprofil ohne Spielkonto bietet keine irreführende direkte Herausforderung an.
- Meldungen können einzeln oder gesammelt als gelesen markiert werden. Eine später angenommene Einladung bleibt ein neues Ereignis, auch wenn die ursprüngliche Einladung schon gelesen war.
- Alle festen Texte stehen auf Deutsch, Türkisch und Englisch zur Verfügung. Die Hauptnavigation bleibt bei fünf Bereichen; Benachrichtigungen sind eine Dienstfunktion der Kopfzeile und eine Unterseite des persönlichen Bereichs.

Die Glocke behauptet keinen Zustellnachweis. „Einladung gespeichert“ bedeutet, dass der vorhandene lokale beziehungsweise serverseitige Befehl erfolgreich war. Eine angezeigte Einladung kann auch später angenommen werden; die bisherigen Herausforderungen haben kein neues automatisches Ablaufdatum bekommen.

## Geöffnete und geschlossene Website

**Website geöffnet:** Echte Konten erhalten neue Zustände über das vorhandene Polling und sehen Glocke, Hinweis und Einladungsübersicht. Es gibt keine neue WebSocket-Verbindung. Browser-Timer, Netzwerk und Hintergrunddrosselung können eine Anzeige verzögern. Andere Aufgaben werden nicht durch eine automatische Weiterleitung unterbrochen; der direkte Einstieg erfolgt nach eigener Annahme oder über den Partie-Link.

**Website geschlossen:** Es erfolgt derzeit **keine** aktive Benachrichtigung außerhalb der Website. Die Einladung bleibt gespeichert und erscheint beim nächsten Öffnen/Anmelden. Weder E-Mail-Versand noch Web-Push oder Betriebssystem-Benachrichtigungen wurden eingerichtet. Auch müssen Sender und Empfänger nicht zum Zeitpunkt der Einladung gleichzeitig online sein.

**Gastdemo:** Alles bleibt zwischen den fiktiven Personas im selben Browser. Zum Ausprobieren als Alex Deniz herausfordern, zur Persona Deniz wechseln, Glocke öffnen und annehmen. Danach als Alex dieselbe Partie über die Annahmemeldung öffnen. Das ist kein geräteübergreifender Gastbetrieb und keine echte E-Mail-Zustellung.

## Daten und Berechtigungen

`chessInvitationEvents` leitet Meldungen direkt aus den bestehenden Herausforderungen ab. Es gibt keine zweite unabhängige Spiel-/Einladungsdatenbank und keine künstlich hochgezählten Benachrichtigungszähler. Ein Ereignis besitzt einen stabilen Schlüssel wie `local-…:invited` oder `local-…:accepted`. Doppelte oder nicht passende Partieverweise werden nicht angezeigt.

Der ergänzte Befehl `readChessNotices` akzeptiert ausschließlich tatsächlich für den handelnden Benutzer vorhandene Ereignisse. Gelesen-Informationen liegen additiv in `modules.chessRead[actorId]`. Die Serverprojektion gibt jedem normalen Konto ausschließlich seinen eigenen Gelesen-Status und seine bisherigen zulässigen Herausforderungen/Partien aus. Die bisherigen Annahme-, Zug- und Blockierungsprüfungen bleiben erhalten.

Die neue Serverfähigkeit lautet `modules.chessNotificationCapabilities = { inApp:true, email:false }`. Diese Änderung ist **lokal vorbereitet, nicht in der Cloud bereitgestellt**. Die Anzeige und Annahme verwenden bereits vorhandene Befehle und funktionieren grundsätzlich auch mit dem bisherigen Serververtrag. Solange der Server die neue Fähigkeit nicht liefert, speichert der Client lediglich Gelesen-Markierungen lokal unter `deutschconnect.chess-read.v1:<Modus>:<Profil-ID>` und erklärt diese Einschränkung. Die Herausforderungen selbst bleiben auf dem Server. Lokaler Gelesen-Status ist keine Sicherheits- oder Zugriffsgrenze.

Im Gastmodus werden Gelesen-Markierungen über die bestehende Demo-Speicherung wiederhergestellt. Fehlgeschlagenes Markieren verändert nicht die Herausforderung und wird nicht als erfolgreich synchronisiert ausgegeben. Ein Profil-/Kontowechsel oder das Verlassen der Einladungsansicht verhindert, dass eine verspätete Annahmeantwort den neuen Arbeitskontext auf eine alte Partie umleitet.

## E-Mail-Vorbereitung und verbleibende Einrichtung

`chessInviteEmail` bereitet bereits einen anbieterunabhängigen Versandvertrag vor:

- Texte und Betreff in DE/TR/EN.
- Ein fest konfigurierter HTTPS-Link zur Einladungsübersicht.
- Eine stabile Kennung `chess-invite/<Einladungs-ID>` für spätere Deduplizierung.
- Empfängerzuordnung über die Benutzer-ID, keine aus dem Browser übernommene Zieladresse.
- Keine E-Mail-Adressen, Passwörter, Bestätigungs-/Login-Tokens oder privaten Freitexte in der Vorlage.
- Zurückgezogene/nicht mehr offene Einladungen und ungeeignete URLs erzeugen keine Vorlage.

**Dieser Helfer sendet nichts.** Es existieren dafür weder Transportadapter noch laufender Versandauftrag, gespeicherte Mail-Einwilligung oder Hintergrundworker. `email:false` ist eine ehrliche Fähigkeitsangabe. Es wurden keine Zugangsdaten gesucht, ausgegeben oder als Frontendvariable angelegt.

Für eine spätere Freigabe sind konkret erforderlich:

1. Ein gewählter Versanddienst, eine bestätigte Absenderadresse/-domain und eine für die Nutzer erreichbare freigegebene HTTPS-App-Adresse. Die lokale Loopback-Adresse des Entwicklungsrechners ist kein geeigneter Einladungslink für andere Geräte.
2. Freiwillige, serverseitig gespeicherte E-Mail-Benachrichtigungseinstellungen mit standardmäßig ausgeschaltetem Versand. Eine Community-Profilfreigabe ist keine Einwilligung in E-Mails.
3. Ein serverseitiger Outbox-/Versandablauf nach erfolgreicher Speicherung der Einladung. Empfängeradresse ausschließlich aus dem verifizierten Auth-Konto ermitteln und nie an den Einladenden oder das öffentliche Frontend ausliefern.
4. Dauerhafte Deduplizierung, Wiederholungsregeln, Versandstatus, Mengenbegrenzung und erneute Prüfung von Blockierung, Einwilligung und Einladungszustand. Eine Anbieter-Idempotenzfunktion ersetzt keine dauerhaft eigene Zustelllogik: Ein mögliches späteres Beispiel begrenzt ihre Aufbewahrung auf 24 Stunden ([Resend-Dokumentation](https://resend.com/docs/dashboard/emails/idempotency-keys)). Es ist damit noch kein Anbieter ausgewählt oder eingerichtet.
5. Der Mail-Link öffnet nur die Website; er nimmt keine Einladung durch einen GET-Aufruf an. Nach Anmeldung werden Empfängerrechte erneut geprüft. Eine zwischenzeitliche Rücknahme oder bereits beantwortete Einladung muss verständlich angezeigt werden. Ein gezielter Rücksprung nach Anmeldung ist bei der tatsächlichen Mail-Anbindung noch praktisch abzunehmen.
6. Kontrollierter Test mit zwei autorisierten Konten und erst danach eine gesondert freigegebene Backend-Bereitstellung. Keine fremden Supabase-Projekte verändern und keine neue Migration ungeprüft ausführen.

## Betroffene Dateien dieses Auftrags

- Neu: `supabase/functions/_shared/chessInvitations.js` – gemeinsame Ereignisregeln und reine E-Mail-Vorbereitung.
- Geändert: `supabase/functions/_shared/social.js`, `platform.js` – private Gelesen-Markierungen, Wiederherstellung und Fähigkeitsanzeige.
- Neu: `src/state/ChessNotificationContext.jsx`, `src/components/ChessInvitations.jsx` – gemeinsamer Zustand, Glocke, Hinweise und Bedienung.
- Geändert: `src/App.jsx`, `src/components/Navigation.jsx`, `CommunityCards.jsx`, `src/pages/MyArea.jsx`, `Games.jsx`, `src/games/ChessLobby.jsx`, `src/data/navigation.js` – Einbindung, Route und direkte Profil-Herausforderung.
- Geändert: `src/styles/games.css`, `src/locales/platform/{de,tr,en}.json` – Darstellung und Übersetzungen.
- Neu: `scripts/chess-notifications.test.mjs`; erweitert: `scripts/check-render.mjs`.
- Dokumentation: dieses Dokument, `README.md`, `docs/SESSION_HANDOFF.md`.

## Tatsächlich ausgeführte Prüfungen

- `npm.cmd test`: **117 Tests bestanden**, davon acht neue Tests zu Empfängerrechten, Einladungsantworten, gemeinsamer eindeutiger Partie, Gelesen-Markierungen, Blockierung, Demo-Neuladen, falschen Partieverweisen und den E-Mail-Vorlagen.
- `npm.cmd run check`: **795 Texte je Sprache**, gleiche Schlüssel und gültige Kodierung.
- `npm.cmd run check:render`: alle bisherigen Module, 87 Demo-Routen je Persona/Sprache und zusätzlich zwölf Einladungs-/Benachrichtigungsansichten pro Sprache erfolgreich. Eingehende/ausgehende Einladung, Annahme, Ablehnung, Rücknahme und Gelesen-Status jeweils in einer fremden Modulansicht und in der Übersicht geprüft. Glockenzähler, Annahmebutton und gemeinsamer Partie-Link sind vorhanden.
- `npm.cmd run build -- --configLoader native`: erfolgreich; bestehende Größenwarnung über 500 kB bleibt.
- `npm.cmd run check:offline`: fünf gebaute statische Ressourcen ohne simuliertes Netz verfügbar; private/API-Anfragen ausgeschlossen. Syntaxprüfung der gemeinsamen Backend-Module und Function sowie `git diff --check` ebenfalls erfolgreich.

Keine erfolgreiche interaktive Browser-, Smartphone- oder echte Zwei-Konten-Abnahme behaupten. Die verfügbare Browsersteuerung war in den vorausgehenden Aufgaben nicht erreichbar; hier wurden Logik und Rendering geprüft. Es gab keinen echten Mailversand und keinen Live-Test der neuen Gelesen-Synchronisierung in der Cloud.
