# Vertrag zur Integration des Admin- und Moderationsmoduls

Stand: 8. November 2026. **Istbeschreibung der Codex-Nutzeranwendung und Vorschlag zur Abstimmung mit Ege, kein bereits gemeinsam vereinbarter Vertrag.** Eges Quellcode, Schema, Rollen und Deployments wurden nicht geprüft oder verändert. Kein zweites Admin-Modul und keine neue Migration erstellt.

## 1. Verbindliche Ausgangsgrenze

Die Nutzeranwendung verwendet Supabase Auth und `POST /functions/v1/platform`. Die bereits freigegebene Cloud-Function ist Version 3; dieser Auftrag verändert ausschließlich die Nutzeroberfläche und Tests/Dokumentation, nicht diese Function. Gastaktionen bleiben in einem eigenen lokalen Repository und dürfen nie durch fiktive Profil-IDs zu echten Kontobefehlen werden.

Aktuelle Datenbank: private `dc_workspace(id=1, revision, payload, updated_at)` und `dc_commands(actor_id, command_id)`; `dc_commit` prüft Revision/Befehls-ID unter einer Transaktionssperre. Browserrollen dürfen beide Tabellen nicht direkt lesen/ändern oder den privilegierten Commit ausführen. Das ist ein kleiner JSONB-Workspace für den Pilot und **kein** normalisiertes Tabellenmodell für größere Schulen.

Alle Identitäten kommen aus dem serverseitig geprüften Bearer-Token und bestätigter E-Mail. `actorId`, `ownerId`, `isModerator` oder Rollenangaben aus einer Anfrage verleihen keine Rechte. Der Handler erzeugt Eigentümer selbst. Moderation kommt derzeit aus der serverseitigen Allowlist `DC_MODERATOR_IDS`, nicht aus bearbeitbaren Profilmetadaten. `communityEnabled` wird aus einer gültig konfigurierten Moderations-Allowlist abgeleitet; das beweist keine tatsächliche personelle Besetzung.

Rollen im folgenden Text:

- **Nutzer:** authentifiziert und E-Mail bestätigt; keine automatisch verifizierte Schulzugehörigkeit.
- **Eigentümer:** Nutzer, dessen ID das betroffene Objekt tatsächlich besitzt.
- **Gruppenmitglied:** serverseitig aus freiem Beitritt, akzeptierter Projektmitgliedschaft oder Eventanmeldung abgeleitet.
- **Moderator:** vom Server ausgewiesene Moderationsrolle. Derzeit global; keine Schul-/Mandantenbegrenzung implementiert.
- Eine zusätzliche **Admin-/Schulleitungsrolle**, globale Kontosperren oder Delegationsrechte sind noch nicht definiert.

## 2. Transport-, Fehler- und Konfliktvertrag

Lesen: POST `{}`. Schreiben, Beispiel:

```json
{
  "commandId": "e2e-example-command-0001",
  "action": {
    "type": "reviewIdeaRequest",
    "id": "local-example-project",
    "profileId": "authenticated-applicant-id",
    "decision": "accept",
    "expectedRecord": "JSON of the originally loaded record"
  }
}
```

Die normale Antwort ist `{protocol:1, revision:<nicht negative sichere Ganzzahl>, state:<gefilterte Nutzersicht>}`. Das Beispiel ist ein Formbeispiel, kein ausführbarer Produktionsdatensatz. Änderungen dürfen erst nach bestätigter Antwort als gespeichert gelten. Kontowechsel müssen ausstehende Antworten verwerfen. Gleiche Sitzung und gleichzeitig angeforderte Reloads teilen im Client dieselbe Anfrage; veraltete Revisionen werden nicht angewendet. Bei gleicher Workspace-Revision kann sich die erlaubte Projektion durch Rollen/Fähigkeiten verändern: solche Änderungen nicht allein wegen gleicher Revision verwerfen.

Wichtige Regeln:

- `commandId` ist pro Nutzer eindeutig, derzeit 8–150 Zeichen, Buchstaben/Ziffern/Bindestrich. Bei unklar beantwortetem Request dieselbe ID **mit identischem Inhalt** wiederverwenden. Die SQL-Deduplizierung speichert derzeit keinen Payload-Hash; derselben ID verschiedene Inhalte zuzuordnen ist kein unterstützter Aufruf.
- Projekt-, Nachhilfe-, Event- und Schach-Anlagen verwenden bestehende `local-…`-Objekt-IDs. Sie sind auch bei Kontodatensätzen keine Kennzeichnung als Demo. Demo/Konto ergeben sich aus dem Zugriffskontext. Ein Wechsel auf UUID-Objekt-IDs muss abgestimmt und migriert werden.
- `expectedRecord` wird bei Projekt-/Nachhilfe-Eigentümeraktionen und Anfrageentscheidung geprüft, **wenn es mitgesendet wird**; die aktuelle Oberfläche sendet es bei relevanten Bearbeitungen. Es ist bislang keine universell erzwungene Vorbedingung. `expectedProfile` prüft nur die tatsächlich geänderten Profilfelder. Schach verlangt die exakte Partie-`revision`.
- Aktuelle Moderatorbefehle wie `approveEvent`, `confirmAttendance`, `resolveReport` besitzen keinen verpflichtenden Vergleichsstand. Eine konkurrierende neue Admin-Oberfläche braucht dafür vor Einführung einen abgestimmten Konfliktvertrag, nicht bloß versteckte Buttons.
- Fachliche Fehler: `{error:<code>}`. Heute HTTP 400 u. a. für `not-owner`, `not-found`, `moderator-required`, `no-evidence`, `event-not-open`, `group-required`, `blocked`, `private-contact`, `rate-limit`, `invalid-input`, `not-allowed`; Konflikt 409; fehlende/ungültige Authentifizierung 401; unbestätigte Identität oder unzulässige Origin 403; technische Ausfälle 503. Rollenfehler sind derzeit nicht durchgehend 403.
- Fachliche Codes behalten und in DE/TR/EN verständlich anzeigen. Keine ungeprüften Anbieterfehler oder Serverstacks als Nutzertext ausgeben. Nach Netzwerkfehler bleibt der Entwurf erhalten; fehlgeschlagener Versand ist kein Erfolg.

## 3. Projekte und Schülerideen

**Wichtig: Projektfreigabe ist derzeit nicht implementiert.** `projectStatus` (`proposal`, `looking`, `preparing`) bezeichnet den eigenen Planungsstand. `lifecycle` (fehlend/`active`, `withdrawn`, `deleted`) ist der Lebenszyklus. `completion` ist eine organisatorische Abschlussbestätigung. Keines dieser Felder darf stillschweigend als Schul-/Adminfreigabe umgedeutet werden. Nicht gelöschte Projekte sind unter Beachtung von Blockierungen sichtbar; zurückgezogene Projekte bleiben als geschlossene Details vorhanden.

| Aktion / Auslöser | Rolle | Betroffene Daten und gültiger Übergang | Serverseitige Prüfungen heute | Ergebnis beim Nutzer | Gemeinsam offen |
| --- | --- | --- | --- | --- | --- |
| `submitIdea`: Projekt absenden | Nutzer mit angegebener bekannter Schule | Neue `ideas[]`, Eigentümer aus Identität, leere Interessen/Anfragen/Mitglieder, `revision=0` | Gültige eindeutige ID, Textgrenzen, bekannte Kategorie/Schulen, keine üblichen privaten Kontaktangaben | Nach Serverbestätigung eigene Detailseite; andere Berechtigte finden das Projekt | F1: Brauchen neue Ideen künftig Freigabe? Bestand und Ideen gegenüber genehmigten Aktivitäten getrennt behandeln |
| `updateIdea`: bearbeiten | Nur Eigentümer | Erlaubte Inhalts-/Planungsfelder; Lebenszyklus unverändert, Revision steigt | Eigentum, nicht gelöscht, optionaler Vergleichsstand, Feldvalidierung/Kontaktschutz | Neuer Inhalt bei beiden Nutzern nach Poll/Reload | F2: Nach Änderungen Freigabe erneut prüfen? Historische Textversionen/Audit fehlen |
| `withdrawIdea` / `removeIdea` | Nur Eigentümer | Offen → zurückgezogen bzw. nicht gelöscht → gelöscht; keine Wiederöffnung vorgesehen | Eigentum und optionaler Vergleichsstand; Moderator erhält dadurch kein Eigentümerrecht | Neue Anfragen entfallen; gelöschter Datensatz verschwindet aus Nutzersicht, Projektgruppe wird geschlossen | F2/F10: Moderatorisches Verbergen/Löschen und abgeschlossene Projekte gesondert definieren |
| `setIdeaInterest` | Anderer Nutzer | Eigene ID zu `interestedIds` hinzufügen/entfernen | Kein Eigentümer; neues Interesse nicht bei zurückgezogenem Projekt | Private Vormerkung, keine Anfrage/Mitgliedschaft | Keine Zustellung als Projektanfrage behaupten |
| `requestIdea` / `cancelIdeaRequest` | Antragsteller | Eigene ID zu `requestedIds` hinzufügen/entfernen | Existenz; Antrag nicht vom Eigentümer, nicht zurückgezogen/abgeschlossen, nicht bereits Mitglied, keine beidseitige Blockierung | Eigentümer sieht offene Anfrage im Projektdetail; Antragsteller seinen eigenen Status | F1: Sperrt künftige Freigabe auch neue Anfragen? |
| `reviewIdeaRequest`: accept/decline | Eigentümer, **kein automatisches Moderatorrecht** | Offen angefragt → akzeptiertes Mitglied oder Anfrage entfernt; Ablehnung erzeugt keine Mitgliedschaft | Anfrage existiert, nicht zurückgezogen/abgeschlossen, kein Block, optionaler Vergleichsstand | Beide sehen denselben bestätigten Status | F2: Administrative Entfernung eines Mitglieds/Widerspruchsprozess existiert noch nicht |
| `leaveIdea` | Mitglied für sich selbst | Eigene ID aus `participantIds` entfernen | Datensatz nicht gelöscht; fremde IDs werden nicht verwendet | Aktuelle Mitgliedschaft/abgeleitete Gruppe ändern sich | F10: Bestätigte historische Abschlussmitglieder bleiben eingefroren |
| `confirmProjectCompletion` | Moderator | Aktives, nicht abgeschlossenes Projekt → `completion={confirmedBy,confirmedAt,memberIds:[owner,...accepted]}`; offene Anfragen leeren; Revision steigt | Moderator, Projekt vorhanden/aktiv, noch keine Bestätigung | Erst dann abgeschlossene Projekte und freigegebene Profilstatistik | F3/F10: Welcher organisatorische Nachweis? Wer darf widerrufen/korrigieren? Kein automatischer Beweis allein durch Knopfdruck |

## 4. Events und Teilnahme

| Aktion / Auslöser | Rolle | Daten / Übergang | Serverseitige Prüfungen heute | Nutzerergebnis | Gemeinsam offen |
| --- | --- | --- | --- | --- | --- |
| `createEvent`: Vorschlag einreichen | Nutzer | `activities[]`, `approval='proposal'`, leere `attendance`, `revision=0`; Eigentümer serverseitig | ID eindeutig, Titel 5–90, Beschreibung 20–1500, bekannte Schule/Kategorie, gültiger zukünftiger Termin, Kontaktschutz | Eigentümer/Moderation sehen Vorschlag; andere Nutzer zunächst nicht | F1/F3: Veranstaltungsberechtigung, zulässige Schulen und verantwortliche Stelle; Schule ist heute Selbstauskunft |
| `approveEvent` | Moderator | `proposal` → `confirmed`; Revision/updatedAt steigen | Moderator und Event vorhanden | Event für andere sichtbar, Anmelden freigeschaltet | F2/F3: Kein Ablehnen-/Rückfrage-/Entfreigeben-Befehl, keine verpflichtende Eingangsrevision oder gespeicherter Freigabeakteur |
| `participation`: interested/joined/null | Nutzer für sich selbst | `participation[userId][eventId]`; Vormerkung, Anmeldung oder Eintrag entfernen | Nicht abgesagt; `joined` nur bei bestätigtem Event; actor aus Sitzung | Eigene Aktivitäten und dynamische Eventgruppe aktualisieren; doppelte Anmeldung bleibt ein Map-Eintrag | F4: Fristen, Kapazität, Warteliste, Minderjährigenfreigabe fehlen; Eigentümer kann sich auch anmelden |
| `confirmAttendance` | Moderator | Angemeldet → zusätzlicher `attendance[userId]={confirmedBy,confirmedAt}`; Anmeldung bleibt getrennt | Event bestätigt, Beginn erreicht, gewünschter Nutzer tatsächlich `joined` | Bestätigte Teilnahme getrennt von Anmeldung gezählt | F3/F4/F10: Nachweismethode, Korrektur/Widerruf; Code erlaubt wiederholte Bestätigung mit neuem Zeitpunkt bei neuer Befehls-ID |
| `awardRecognition` | Moderator | Neue eindeutige Anerkennung je Nutzer/Event; erneut vergeben erzeugt keine zweite | Teilnahmebeleg existiert; bestätigte Teilnahmen aus mindestens zwei aktuell angegebenen Schulen | Eigene Anerkennung; öffentlich nur bei zusätzlicher freiwilliger Freigabe | F3/F10: Schulprüfung, eingefrorene Schulzuordnung, Widerruf und Folgen einer Absage definieren |
| Event ändern/absagen/löschen | **Noch kein vorhandener Befehl** | `cancelled` wird in Lese-/Teilnahmeregeln bereits berücksichtigt | Keine neue API hierfür als vorhanden annehmen | Von Backend unterstützte Zustandsfolgen erst nach abgestimmtem Vertrag anzeigen | F2/F4: Vollständiger Workflow und Umgang mit bestehenden Anmeldungen/Belegen erforderlich |

Eventinteresse ist keine Anmeldung; Anmeldung ist keine Anwesenheit; Anwesenheit erzeugt nicht automatisch eine Auszeichnung. Eine Freigabe ist kein Beweis, dass eine Veranstaltung tatsächlich stattgefunden hat.

## 5. Community, Meldungen und Benutzerblockierungen

| Aktion / Auslöser | Rolle | Daten / Übergang | Serverseitige Prüfungen heute | Nutzerergebnis | Gemeinsam offen |
| --- | --- | --- | --- | --- | --- |
| `joinGroup` / `leaveGroup` | Nutzer selbst | Mitgliedschaft eines offenen Themenraums (`kind='topic'`) ergänzen/entfernen | Passender offener Raum bzw. eigene bestehende Mitgliedschaft | Nach bestätigtem Beitritt lesen/schreiben; nach Austritt keine Beiträge im Payload | F5: Schul-/Projektrollen nicht als freien Themenbeitritt behandeln |
| `createProjectGroup` / `createEventGroup` | Projekt: Eigentümer; Event: Eigentümer oder Moderator | Kontextgruppe einmal anlegen; Mitgliedschaft dynamisch aus Projektannahmen bzw. Eventanmeldungen | Kontext vorhanden; Projekt nicht gelöscht/zurückgezogen, Event bestätigt; noch keine Kontextgruppe | Berechtigte erhalten Raumzugriff; Mitgliedschaft entfällt mit zugrunde liegender Beziehung | F2/F5: Abschluss/Absage, Archivierung und Ausschluss einzelner Personen; Moderator ist nicht automatisch Mitglied |
| `postMessage` | **Mitglied**, auch Moderator braucht Mitgliedschaft | Neuer `messages[]`-Eintrag mit actor und Serverzeit | Moderation eingerichtet, Raum offen, Mitgliedschaft, ID/Text 3–1200, Kontaktschutz, maximal 10 Beiträge/Minute; identische Wiederholung gleicher Nachricht erlaubt, geänderter Inhalt unter gleicher ID abgewiesen | Beitrag beim anderen Mitglied über Poll/Reload, Entwurf erst nach Bestätigung leeren | F5/F7: Retention, Eskalation, offene/geschlossene Räume; Leserecht der Moderation ist kein Schreibrecht |
| `removeMessage` / `moderateMessage` | Eigener Beitrag bzw. Moderator | Beitrag wird aus `messages` entfernt | Eigentum oder Moderator; `moderateMessage` nur Moderator | Inhalt verschwindet; Meldungsmetadaten können bestehen bleiben | F7: Kein Tombstone oder geschützter Inhaltsnachweis; gemeldeter Inhalt nach Entfernung nicht mehr rekonstruierbar |
| `report` | Nutzer | Pro Melder/targetType/targetId bestehende Meldung ersetzen; `status='pending'` | reason privacy/inappropriate/spam, existierendes Profil bzw. lesbarer Gruppenbeitrag | Meldung serverbestätigt und in Moderationsprojektion verfügbar; keine Garantie menschlicher Bearbeitung/externen Nachricht | F6/F7: Zieltyp Teil der Schlüsseldefinition, Zuständigkeit, Antwort an Melder, Fristen und Missbrauchsbehandlung |
| `resolveReport` | Moderator | `pending` → `reviewed`, `reviewedAt` | Moderator und Meldung vorhanden; aktuelle Suche nach ownerId/targetId | Verschwindet aus offener Moderationsliste; keine extra Nutzerbenachrichtigung | F2/F6: Vollständiger zusammengesetzter Schlüssel, Grund/Entscheidung, Bearbeiter und Revision fehlen |
| `blockPerson` | Nutzer für eigene Blockliste | Fremde ID in `modules.blocks[actor]` ergänzen/entfernen | Bekannter anderer Nutzer; boolescher Sollzustand | Angebote/Profile/Beiträge/Schach in beiden Richtungen eingeschränkt; eigene Daten nicht gelöscht | F8: Persönliches Blockieren von globaler Kontosperre unterscheiden |
| Globale Kontosperre, Rollenwechsel, Schulverifizierung | **Kein bestehender Admin-Befehl** | Nicht aus `blockPerson` oder `preferences` ableiten | Rollenänderungen nur in vertrauenswürdiger Serververwaltung | Nutzeroberfläche darf weder Rollen noch gültige Sitzung selbst behaupten | F5/F8/F9: Serverrollen, Sitzungserneuerung/Widerruf, Betroffeneninformation und Einspruch gemeinsam definieren |

Privilegierte Moderationssichten dürfen nicht ungefiltert in die normale Nutzeranwendung übernommen werden: Sie enthalten heute u. a. weitere Profile, Teilnahmen, Meldungen und Gruppenbeiträge. Das bestehende globale Moderationsrecht ist vor einer breiteren Beta auf Zuständigkeit und Datensparsamkeit zu prüfen. Die heutige Nachrichtenbegrenzung zählt noch vorhandene eigene Beiträge der letzten Minute; sie ist kein von Inhaltslöschung unabhängiger Missbrauchszähler. Ein stärkeres Rate-Limit gehört zum gemeinsam festzulegenden Betriebsvertrag F6/F7.

## 6. Nachhilfe, Profile und Spiele

| Aktion / Auslöser | Rolle | Daten / Übergang | Serverseitige Prüfungen heute | Nutzerergebnis | Gemeinsam offen |
| --- | --- | --- | --- | --- | --- |
| `submitTutoring` / `updateTutoring` / `closeTutoring` / `removeTutoring` | Nutzer mit Schule / eigener Eintrag | Neuer offener Eintrag, erlaubte Felder ändern, offen → closed/deleted | Feld-/Sprach-/Schulprüfung, Eigentum, optionaler Vergleichsstand und Kontaktschutz | Angebot/Anfrage sichtbar; geschlossen nicht mehr aktiv; gelöscht ausgeblendet | F1/F2: Kein Moderatorrecht auf diese Eigentümerbefehle und keine Nachhilfefreigabe vorhanden |
| `saveContactDraft` / `toggleModuleInterest` | Nutzer für eigenen Entwurf/Vormerkung | Privater Kontaktentwurf bzw. eigener Interessenschlüssel | Ziel existent/offen für Entwurf, kein Block; gültiger Text/Zieltyp | **Keine Zustellung**, kein Gespräch, keine Bestätigung durch Anbieter; keine Kontaktstatistik als versandte Anfrage | F11: Falls gewünscht strukturierter Zustell-/Antwortvertrag mit Zustimmung, Zugriffsschutz, Grenzen und Betreuung; nicht als existierende API darstellen |
| `preferences`, `setCommunityVisibility`, `shareAwards` | Nutzer für sich selbst | Profilfelder, getrennte optionale Freigaben, Verzeichnissichtbarkeit/Auszeichnungen | Erlaubte Felder, Feldkonflikte, bekannte Schule/Sprache, Kontaktschutz; keine Rollenfelder | Nur explizit freigegebene Schule/Interessen/Projekte/Anerkennungen in öffentlicher Projektion | F5/F9: Auth-Profil-Zuordnung, Schulverifizierung, Widerruf, Datenauskunft/-löschung; IDs/Anzeige nicht aus E-Mail ableiten |
| `challengeChess`, `respondChess`, Schachzüge/Remis/Aufgabe | Beteiligte Spieler | pending → accepted/declined/cancelled; Annahme erzeugt genau eine gemeinsame Partie; aktive Partie → ended | Freigegebener Gegner, keine Blockierung; Antwort nur zuständiger Beteiligter; Zugrecht, exakte Partie-Revision, rekonstruierte Legalität | In-App-Einladung, gemeinsames Brett und gespeicherter Stand; kein E-Mail-/Push-Versand | F8/F12: Kontosperren/Moderationsfälle laufender Partien, Integritätsregeln; Demo/Hotseat von Online trennen |
| `readChessNotices` | Betroffener Nutzer | Eigene abgeleitete Ereignisschlüssel als gelesen markieren | Nur eigene sichtbare Ereignisse, gültige Schlüssel, maximal 100 je Befehl | Private Lesemarkierung, fremde Einladungen werden nicht verändert | F12: Künftige Benachrichtigungsinfrastruktur muss Ereignis-ID und Deduplizierung bewahren |
| Arcade-/Schul-/Globalranglisten | Lokal bzw. Demo | Kein vorhandener gemeinsamer Server-Ergebnisbefehl | Client-Scores sind nicht verifizierte Leistungen | Persönliche Rekorde lokal; Global/Schule nur erklärte Demo, bei Konten keine erfundene gemeinsame Liste | F12: Opt-in, echte Prüfungen, Regeln, eindeutige Runden und verlässliche Schule vor Backendintegration |

## 7. Auswirkungen auf persönliche und öffentliche Statistiken

Statistiken sind abgeleitete Werte aus `src/data/personalArea.js`, `_shared/profiles.js` und den Spielselektoren. Es gibt keinen Zähler, den ein Admin unabhängig „hochsetzen“ darf.

| Fachliche Änderung | Heutige Berechnung / erwartete Auswirkung | Integrationsgrenze |
| --- | --- | --- |
| Interesse/Anfrage zu Projekt | Vormerkungen bzw. offene Anfragen; kein Mitgliedschafts-/Abschlusszähler | Nicht mit akzeptierten Mitgliedern zusammenführen |
| Anfrage angenommen / Mitglied verlässt Projekt | Aktuelle akzeptierte Mitgliedschaften und dynamische Projektgruppe ändern sich | `activeProjects` zählt auch Eigentümerschaft, `projectMemberships` nur fremde akzeptierte aktive Projekte |
| Projektabschluss bestätigt | Abschlussmitglieder werden eingefroren; aktive Beteiligung sinkt, abgeschlossene steigt für diese IDs | Späterer Austritt ändert das historische Mitgliederarray nicht; Widerrufsaktion fehlt |
| Projekt zurückgezogen/gelöscht | Keine aktive Beteiligung; heutiger Abschlussselektor schließt solche Projekte ebenfalls aus | F10: Gilt diese Auswirkung auf bereits erbrachte Leistungen? Vor administrativer Löschung entscheiden |
| Eventanmeldung / Rücknahme | Ein `joined`-Mapeintrag, höchstens eine Anmeldung; keine bestätigte Teilnahme | `upcomingRegistrations` zählt nur zukünftige nicht abgesagte joined-Events; ältere `eventRegistrations` zählt alle joined-Einträge. Nicht als identische Kennzahl behandeln |
| Anwesenheit bestätigt | Eigener bestätigter Beleg, vergangenes bestätigtes nicht abgesagtes Event → bestätigte Teilnahme | Keine Ableitung allein aus Registrierung/Datum; organisatorischer Nachweis bleibt Aufgabe der verantwortlichen Stelle |
| Event abgesagt/Bestätigung zurückgenommen | Lese-/Zählregeln berücksichtigen `cancelled`/approval für Anwesenheit und kommende Anmeldung | F4/F10: Bestehende Awards werden derzeit nicht automatisch widerrufen; dazu gibt es keinen Workflow |
| Nachhilfe geschlossen/gelöscht | Aktive eigene Angebote/Anfragen sinken; Entwürfe sind keine Zustellungen | Kein Erfolgs-/Vermittlungszähler vorhanden |
| Beitrag moderiert / Meldung geprüft / Person blockiert | Beitragslisten/Sichtbarkeit ändern sich; keine künstlichen Punkte | Keine Wirkung auf Projekt-/Teilnahmebelege erfinden |
| Sichtbarkeit zurückgenommen | Öffentliche Profile/Felder/Anerkennungen verschwinden entsprechend den Freigaben | Private persönliche Aktivitäten bleiben vorhanden; öffentliche Zahl muss nur erlaubte Datensätze zählen |

## 8. Fragen an Ege und gemeinsame Entscheidungen

| Kennung | Vor Implementierung gemeinsam klären |
| --- | --- |
| F1 | Welche Objekte benötigen Freigabe? Neue Schüleridee, Änderung, öffentliche Aktivität und Veranstaltungsfreigabe getrennt? Welcher sichere Default für vorhandene Inhalte? |
| F2 | Pflichtrevisionen, idempotente Sollzustandsbefehle, Rollback und nachvollziehbarer Audit-Eintrag (Akteur, Grund, Zeitpunkt, Objekt) für Adminaktionen? Keine konkurrierenden Vollsnapshot-Schreiber. |
| F3 | Wer prüft tatsächliche Durchführung, Teilnahme und Anerkennung, auf welcher Grundlage? Zeit-/Schulbezug einfrieren und Korrekturen nachvollziehbar machen. |
| F4 | Eventabsage, Änderung, Kapazität/Frist, Abmeldung nach Durchführung und Information der Betroffenen? Was bleibt als historischer Beleg erhalten? |
| F5 | Gemeinsame Auth-Quelle, globale vs. schulbezogene Rollen, Least-Privilege-Projektionen, Gruppenlese-/Schreibrechte und Rollenentzug bei bereits offenen Sitzungen? |
| F6 | Zuständige Moderationsinstanz, Bearbeitungszustände, Eskalation und Rückmeldung an Melder; keine Bearbeitungsgarantie ohne tatsächliche Organisation. |
| F7 | Datenminimierung, Beweissicherung im Meldefall, Löschfristen, Löschmarkierung und endgültige Löschung/Backups mit Schutz Minderjähriger? |
| F8 | Globale Kontosperre gegenüber persönlicher Blockierung; Verhalten laufender Projekte/Partien und Beschwerdeweg? |
| F9 | Verifizierte Schulzugehörigkeit gegenüber Selbstauskunft, Zustimmungs-/Profilfreigaben und Kontolöschung? Kein Rollen-/Schulvertrauen aus frei editierbaren Metadaten. |
| F10 | Widerruf/Korrektur bestätigter Leistungen und Awards; Auswirkungen auf Historie und Profilstatistik vor Datenmigration festlegen. |
| F11 | Nachhilfe zunächst als privater Entwurf belassen oder begrenzte echte Anfragezustellung bauen? Keine privaten Nachrichten unbemerkt einführen. |
| F12 | Späteres gemeinsames Benachrichtigungs-/Ranglistensystem, geprüfte Datenquellen und freiwillige Teilnahme; kein ungeprüfter Upload lokaler Scores. |

## 9. Zusammenführung ohne inkompatibles Zweitschema

1. Eges Branch, Schema/Migrationen und API-Vertrag ohne Geheimnisse lesend vergleichen; Namen gleicher Tabellen sind kein Beweis gleicher Bedeutung.
2. Auth-UUIDs, Schulen, Objekt-IDs, Revisionen, Status und Freigaben explizit abbilden. Keine Zuordnung anhand gleicher Anzeigenamen/E-Mails; keine Demo-Daten in echte Konten übernehmen.
3. Eine gemeinsame Schreibautorität wählen. Entweder vorerst kompatibler Handler/Workspace oder abgestimmter Adapter zu normalisierten Tabellen; keine parallele zweite Datenbankstruktur auf Verdacht anlegen.
4. Entscheidungen F1–F12 festhalten, API-/Payloadversion und Fähigkeitssignale vereinbaren. Alte Clients dürfen fehlende Fähigkeiten nicht als gewährte Rechte interpretieren.
5. Migration/Backfill/Rollback in isolierter Kopie mit fiktiven Daten entwickeln und gesondert freigeben. Keine produktiven Daten überschreiben.
6. Bestehende Unit-, HTTP-, Render- und Playwrighttests gegen den gemeinsamen Adapter wiederholen. Positive und negative Rollenfälle müssen über den Server bestehen: Schüler A/B, Moderator ohne Gruppenmitgliedschaft, falsche Schule/Zuständigkeit und widerrufene Rolle.
7. Erst nach genehmigter Bereitstellung mit kontrollierten bestätigten Konten live abnehmen; die aktuelle lokale HTTP-Simulation ist kein solcher Nachweis.

Quellen dieses Istvertrags: `supabase/functions/_shared/{platformHandler,platform,social,profiles,chess}.js`, bestehende SQL-Migration, `src/services/supabase.js`, `src/state/AccountContext.jsx`, persönliche/öffentliche Selektoren und `tests/e2e/`. Es wurden ausschließlich bestehende Abläufe analysiert; neue administrative Endpunkte sind nicht implementiert.
