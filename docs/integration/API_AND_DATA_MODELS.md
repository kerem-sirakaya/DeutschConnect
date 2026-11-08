# Codex: API, Datenmodelle und Persistenz

Stand 8. November 2026; verbindlicher Quellstand: [Inventar mit SHA-256 und Symbolzeilen](CODEX_SOURCE_INVENTORY.json). Einstieg: [Blueprint](../CODEX_INTEGRATION_BLUEPRINT.md). Diese Referenz beschreibt **Istverhalten**, keine neue API und keine ausgeführte Migration.

## 1. Transportvertrag

Quelle: `supabase/functions/_shared/platformHandler.js:createPlatformHandler` (Zeile 4), `src/services/supabase.js:createSupabaseService` (17), `src/state/AccountContext.jsx:dispatch` (67).

| Aufruf | Eingaben | Antwort / Wirkung |
| --- | --- | --- |
| `POST /functions/v1/platform` lesen | JSON `{}`; Bearer-Token eines bestätigten Kontos; Browser zusätzlich öffentlicher `apikey` | `{protocol:1, revision:n, state:<erlaubte Projektion>}`; legt beim ersten erfolgreichen Zugriff ggf. eigenes Profil an |
| Derselbe Endpunkt schreiben | `{commandId,action:{type,...}}` | Derselbe Antworttyp, keine rohe SQL-Zeile und kein separater Nachrichtenversand |
| `OPTIONS` | Origin / angefragte Header | CORS-Header; prüft keine Identität. Erlaubnis zum Lesen/Schreiben folgt daraus nicht |

`commandId`: HTTP validiert 8–150 Zeichen `[a-z0-9-]`, unabhängig von der SQL-Längenregel 1–150. Eindeutigkeit pro Auth-UUID. Derselbe unklar beantwortete Auftrag wird mit derselben ID und identischem Inhalt wiederholt. **Kein Payload-Hash in `dc_commands`**: dieselbe ID mit anderem Inhalt ist nicht unterstützt. Ein deduplizierter Auftrag gibt die aktuelle erlaubte Sicht zurück. `bootstrap` ist die interne Befehls-ID für Profilanlage, kein normaler Nutzer-Command.

Vor jedem Zugriff wird der Bearer-Token serverseitig mit Supabase `/auth/v1/user` geprüft; `email_confirmed_at` ist Pflicht. `actor`, Eigentum und Moderatorrecht stammen nie aus frei gesendeten Rollen/IDs. Handler lädt den Workspace, wendet `addAccount` und den Reducer an, versucht bis zu fünf CAS-Commits und projiziert danach den erlaubten Zustand. Der Browser verwirft fremde `activeId`, fehlende eigene Profile, ungültige Protokolle/Revisionen sowie Antworten einer inzwischen gewechselten Sitzung.

| HTTP | Bedeutung / Codes |
| --- | --- |
| 200 | bestätigter Stand; gespeichert erst nach dieser Antwort anzeigen |
| 400 | erlaubte Fachfehler, etwa `invalid-input`, `not-owner`, `not-found`, `not-allowed`, `blocked`, `group-required`, `private-contact`, `event-not-open`, `no-evidence`, `moderator-required`, `moderation-required`, `rate-limit`; **Achtung:** `moderation-required` ist derzeit nicht in der Handler-Allowlist und fällt tatsächlich auf 503 `unavailable` zurück |
| 401 | `account-required`, fehlender/abgewiesener Token |
| 403 | `verification-required` oder unzulässige Origin/Methode |
| 409 | `conflict` (Revision/Änderungsstand/zu viele CAS-Konflikte) |
| 503 | unbekannter interner Fehler wird zu `unavailable`; keine Serverstacks |

Quellen für die folgende vollständige Referenz: **P** = `supabase/functions/_shared/platform.js:applyPlatformAction` (28); **S** = `_shared/social.js:reduceSocial` (8). Alle Aktionen erfordern ein bestätigtes Konto mit vorhandenem Profil; dieses kann derselbe Aufruf bootstrappen. Unzulässige S-Aktionen lassen den Zustand unverändert und werden durch P zu `not-allowed`. Fachliche Validierung ersetzt keine generische vollständige JSON-Schema-Validierung.

## 2. Command-Referenz: Profil, Events, Projekte, Nachhilfe

Notation: `id` ist die Objekt-ID, `profileId` ein betroffenes anderes Konto; Schauspieler ist immer der geprüfte Aufrufer. `expectedRecord` ist ein optionaler JSON-String mit ursprünglicher `revision`, `expectedProfile` ein optionaler JSON-String für geänderte Profilfelder. Nicht universell erzwungen! Alle Zeilen liefern den globalen Antworttyp aus Abschnitt 1.

| Command / Quelle | Eingaben neben `type` | Rolle / Bedingungen / Fehler | Zustandsänderung; Betroffene / Statistiken / Benachrichtigung | Prüfquellen |
| --- | --- | --- | --- | --- |
| `preferences` P | `patch`, optional `expectedProfile` | Eigenes Profil; nur freigegebene Felder, Schul-/Text-/Sprach-/Sharing-Prüfung; `conflict`, `private-contact` | Eigenes Profil; freiwillige Projektion ändert sich; keine Nachricht | backend, profiles-statistics, state-quality |
| `participation` P | `eventId,status:null|interested|joined` | Event vorhanden, nicht abgesagt; joined nur approval confirmed; **kein Zukunfts-/Kapazitätscheck**; `event-not-open` | Eigene Map-Anmeldung; Gruppenmitgliedschaft/Registrierungsstatistik; kein Anwesenheitsbeleg und keine Glocke | backend, personal-area, E2E Events; Befund DC-I02 |
| `createEvent` P | `id,event:{title,description,category,hostSchoolId,startsAt}` | Nutzer; bekannte Schule, künftiges Datum, gültige ID/Texte | Neues proposal-Event, owner vom Server, leere attendance; eigener Eventzähler; keine Nachricht | backend, E2E Events/Formular |
| `approveEvent` P | `eventId` | Moderator, existierendes Event | approval confirmed, revision++; keine Wiederöffnung/Absageprüfung, wiederholbar; keine Nachricht | backend, E2E Events |
| `confirmAttendance` P | `eventId,profileId` | Moderator; confirmed, begonnen, Nutzer joined; `no-evidence` | attendance-Beleg mit Moderator/Zeit; echte Teilnahmestatistik; keine Glocke | backend, profiles-statistics |
| `submitIdea` P | `id,idea:{title,description,category,...}` | Eigene Schule gesetzt; gültige ID/Text/Kategorie; kein Kontakttext | Neue Idee ohne Freigabe-Workflow, owner/server school, leere Mitglieds-/Anfragelisten; eigener Projektzähler | backend, E2E Projekte |
| `updateIdea` P | `id,idea`, optional `expectedRecord` | Eigentümer, nicht gelöscht, Inhalte gültig; not-owner/conflict | Erlaubte Inhalts-/Planungsfelder, revision++; kein neuer Autor, keine automatische Mitteilung | backend, state-quality, E2E Konflikte |
| `withdrawIdea` P | `id`, optional `expectedRecord` | Eigentümer, nicht gelöscht | lifecycle withdrawn, revision++; Projektgruppe geschlossen; nicht mehr aktiv/abgeschlossen gezählt | backend, personal-area |
| `removeIdea` P | `id`, optional `expectedRecord` | Eigentümer, nicht gelöscht | lifecycle deleted (Soft Delete), revision++; aus Projektion, Gruppe geschlossen; kein physischer SQL-Delete | backend, E2E Eigentum |
| `setIdeaInterest` P | `id,interested:boolean` | Fremdes Projekt; neues Interesse nicht withdrawn | Eigene interessierte ID, revision++; nur private Vormerkung, keine Mitgliedschaft/Nachricht | backend, personal-area |
| `requestIdea` P | `id` | Kein Eigentümer/Mitglied; nicht withdrawn/completed; kein beidseitiger Block | Eigene ID requestedIds, revision++; Antrag für Eigentümer sichtbar; **keine allgemeine Glocke** | backend, E2E Anfragen |
| `cancelIdeaRequest` P | `id` | Eigene Anfrage; Projekt nicht deleted | Eigene ID entfernen, revision++ | backend, personal-area |
| `reviewIdeaRequest` P | `id,profileId,decision:accept|decline`, optional `expectedRecord` | Nur Eigentümer; offene Anfrage, nicht withdrawn/completed, kein Block | Anfrage entfernen, bei accept Mitglied hinzufügen; abgeleiteter Gruppenzugang; keine Mitgliedschaft bei decline | backend, E2E Annehmen/Ablehnen |
| `leaveIdea` P | `id` | Eigene Mitgliedschaft, Projekt nicht deleted | Eigene ID participantIds entfernen; eingefrorene completion.memberIds bleiben | backend, profiles-statistics |
| `confirmProjectCompletion` P | `id` | Moderator; aktiv und noch nicht abgeschlossen; `no-evidence` | completion mit Zeit/Moderator/eingefrorenen owner+Mitgliedern, Anfragen leeren, revision++; Abschlussstatistik | profiles-statistics, backend |
| `submitTutoring` P | `id,record:{kind,subject,topics,description,availability,languages,format}` | Eigene Schule, eindeutige ID, gültiger Inhalt, kein Kontakttext | Neuer Datensatz; owner/school vom Server; Angebots-/Suchzähler | backend, E2E Nachhilfe |
| `updateTutoring` P | `id,record`, optional `expectedRecord` | Eigentümer; gleiche Validierung | Inhalt ändern, revision/updatedAt; lifecycle bleibt | backend, E2E Nachhilfe |
| `closeTutoring` P | `id`, optional `expectedRecord` | Eigentümer, nicht deleted | lifecycle closed, revision++; keine aktive Vermittlung | backend, modules |
| `removeTutoring` P | `id`, optional `expectedRecord` | Eigentümer, nicht deleted | lifecycle deleted, ausgeblendet | backend, modules |
| `toggleModuleInterest` P | `targetType:initiative|tutoring|person,targetId` | Ziel existiert; Person sichtbar/nicht blockiert | Eigene `type:id`-Vormerkung umschalten; keine Zustellung | backend, modules |
| `saveContactDraft` P | `targetId,note` | Aktiver Nachhilfeeintrag, kein Block, Text 10–600 | Privater Entwurf pro owner+target ersetzen; **keine Nachricht an Anbieter** | E2E private Entwürfe, backend |
| `setCommunityVisibility` P | `visible:boolean` | Nur eigenes Profil | Freiwillige Verzeichnissichtbarkeit; keine automatische Freigabe von Schule/Interessen/Projekten | profiles-statistics, E2E Profil |

Prüfquellen-Kürzel beziehen sich auf `scripts/<name>.test.mjs`; E2E auf `tests/e2e/local.spec.js`. Einzelne Zeilen sind durch gemeinsame Ablauf-/Modelltests abgedeckt, nicht jede mögliche Kombination. Keine Behauptung einer Live-Command-Abnahme.

## 3. Command-Referenz: Community, Moderation, Schach

| Command / Quelle | Eingaben | Rolle / Bedingungen / Fehler | Wirkung / Betroffene / Statistik / Hinweis | Prüfquellen |
| --- | --- | --- | --- | --- |
| `postMessage` P | `id,roomId,body` | communityEnabled; tatsächliches Mitglied, Raum offen; 3–1200, keine Kontakte; max. 10 eigene Beiträge/Minute; gleiche ID+Inhalt idempotent | Gemeinsamer Gruppenbeitrag; Empfänger lesen über Polling, **keine Glockenbenachrichtigung** | http-handler, audit, E2E Gruppen |
| `removeMessage` P | `id` | Eigentümer oder Moderator | Beitrag physisch aus Workspace-Array entfernen; kein Auditarchiv | backend, E2E Rechte |
| `moderateMessage` P | `id` | Nur Moderator | Gleiche Entfernung; Meldung nicht automatisch reviewed | backend, E2E Moderation |
| `report` P | `targetType:person|message,targetId,reason:privacy|inappropriate|spam` | Ziel vorhanden; Nachricht im eigenen Raum | Meldung pro owner+type+target ersetzen, pending; Moderatorübersicht, keine externe Zustellung | backend, E2E Melden |
| `resolveReport` P | `targetId,ownerId` | Moderator; Meldung vorhanden | status reviewed + reviewedAt; Match bislang ohne targetType; kein unveränderliches Audit | backend, E2E Melden |
| `awardRecognition` P | `eventId,profileId` | Moderator; attendance für Person, mindestens zwei Schul-IDs unter bestätigten Anwesenden | Einmalige collaboration-Auszeichnung pro Event/Person; private Statistik; Schule Selbstauskunft | backend, profiles-statistics |
| `readChessNotices` S | `keys:string[1..100]` | Nur eigene vorhandene lesbare Ereignisschlüssel | Private eindeutige Lesemarkierungen, Ungelesen-Zahl sinkt | chess-notifications |
| `blockPerson` S | `profileId,blocked:boolean` | Bekanntes fremdes Profil (Demo zusätzlich Fixture) | Eigene Blockliste; beidseitiger Effekt auf Sicht/Schach; keine globale Kontosperre | backend, chess-notifications |
| `shareAwards` S | `shared:boolean` | Eigene Freigabe | Auszeichnungen optional im freigegebenen Profil | profiles-statistics |
| `challengeChess` S | `id,profileId` | Fremdes freigegebenes Profil, kein Block, keine offene Einladung für dasselbe Paar | pending Challenge; abgeleitetes incoming invited-Ereignis beim Empfänger | chess-games, chess-notifications, E2E Schach |
| `respondChess` S | `id,response:accepted|declined|cancelled` | Pending, nicht blockiert; Empfänger accepted/declined, Sender cancelled | accepted erzeugt genau zugeordnete Partie `<challengeId>-game`; Antworten als abgeleitete Hinweise; kein Mailversand | chess-games, chess-notifications, E2E Schach |
| `startChess` S | `id` | Eindeutige gültige ID | hotseat, beide Seiten actor; keine Online-Ranglistenpunkte | chess-games, leaderboards |
| `chessMove` S | `id,revision,move:{from,to,promotion?}` | Partie aktiv, Spieler, exakte Revision, Zugrecht, legal, kein Block | Koordinatenzug speichern, Server rekonstruiert Partie; terminales result bei Ende; Siegerstatistik abgeleitet | chess-games, leaderboards, E2E Schach |
| `chessResign` S | `id,revision` | Gleiche Partieberechtigung | ended/resigned, Gegner gewinnt; leere ungespielte Partie zählt in Statistik nicht | chess-games, leaderboards |
| `chessOfferDraw` S | `id,revision` | Gleiche Partieberechtigung | drawOffer=actor; revision++; kein allgemeiner Hinweis | chess-games |
| `chessDraw` S | `id,revision` | Remisanspruch oder Gegenseitenangebot; Regeln im Reducer | ended, winner null, reason claimed/agreed; kein Siegpunkt | chess-games, leaderboards |
| `joinGroup` S | `id` | Offene topic-Gruppe | Eigene ID hinzufügen, keine projekt-/eventfremde Aufnahme | backend, E2E Gruppen |
| `leaveGroup` S | `id` | Eigenes topic-Mitglied | ID entfernen, nächste Sicht ohne Nachrichten | backend, E2E Gruppen |
| `createProjectGroup` S | `ideaId` | Aktive eigene Idee, Kontext noch ohne Gruppe | `project-<ideaId>`; Mitglieder aus owner+angenommenen Teilnehmern | backend, E2E Projekte |
| `createEventGroup` S | `eventId` | Confirmed; Eigentümer oder Moderator; Kontext noch ohne Gruppe | `event-<eventId>`; Mitglieder aus owner+joined, dynamisch | backend, audit |

Es gibt **42** unterstützte Command-Namen. Es gibt keinen Command für private Direktnachrichten, E-Mail-Versand, Arcade-Serverergebnisse, globale Leaderboard-Teilnahme, Kontosperren, Schulverifizierung, Eventabsage/-bearbeitung/-löschung oder allgemeine Projektfreigabe. `switchProfile` und Demo-Recovery sind lokal, keine Kontobefehle.

## 4. Auth-Endpunkte und Callback

Direkte Supabase-Auth-REST-Aufrufe aus `src/services/supabase.js`; keine eigene Passwortprüfung:

| Endpunkt | Verhalten |
| --- | --- |
| `POST /auth/v1/signup?redirect_to=...` | email/password und Metadaten displayName/language; keine Sitzung aus Signup-Antwort ableiten |
| `POST /auth/v1/resend?redirect_to=...` | type signup, email; Meldung bewusst konditional zur zulässigen Anfrage |
| `POST /auth/v1/token?grant_type=password` | Passwortlogin; zurückgegebene Sitzung vor Speicherung unabhängig verifizieren |
| `POST /auth/v1/token?grant_type=refresh_token` | Ablaufgrenze 45 s; serialisiert mit Web Lock oder Promise-Warteschlange; keine ELO-/App-Daten darin |
| `GET /auth/v1/user` | Identitäts-/Bestätigungsprüfung; Browser und Function prüfen unabhängig |
| `POST /auth/v1/verify` | Unterstützter token_hash + type signup/email aus bewusstem Callback |
| `POST /auth/v1/logout` | Vorhandene Identität prüfen; lokales Entfernen im finally |

`captureAuthCallback` in `src/services/authCallback.js:4` läuft bereits in `src/main.jsx`. Ergebnis nur im Speicher: none/tokens/otp/error. URL wird zu `#/me/account` bereinigt. Ein bloßer Code wird ohne PKCE-Verifier nicht als Sitzung übernommen. Ein anderes gültiges Konto bleibt bis zur ausdrücklichen Kontowahl erhalten. Eine bestätigte E-Mail ohne Sitzung ist kein Login. Detaillierte Grenzen und aktuelle localhost-Konfiguration: [AUTH_CONFIRMATION_FIX](../AUTH_CONFIRMATION_FIX.md).

## 5. Physisches Codex-Schema

Einzige eigene Migration: `supabase/migrations/202611070001_platform.sql`. Supabase-interne `auth.users`/Sitzungstabellen werden nicht neu definiert.

| Objekt | Spalten / Constraints / Rechte |
| --- | --- |
| `public.dc_workspace` | id integer PK CHECK id=1; revision bigint NOT NULL DEFAULT 0; payload jsonb NOT NULL; updated_at timestamptz NOT NULL DEFAULT now(). Keine JSON-Feld-Checks/FKs, kein revisions>=0-CHECK im SQL |
| `public.dc_commands` | actor_id uuid NOT NULL FK auth.users(id) ON DELETE CASCADE; command_id text NOT NULL CHECK length 1..150; created_at timestamptz default now(); zusammengesetzter PK actor_id+command_id |
| `public.dc_commit(bigint,jsonb,uuid,text)` | boolean; SECURITY DEFINER, search_path leer; Transaktions-Advisory-Lock 9347201, doppelte ID zuerst true, Revision lesen FOR UPDATE, abweichend false, Snapshot hochzählen/upsert und Command atomar einfügen |

RLS auf beiden Tabellen; anon/authenticated ohne Tabellenrechte und ohne RPC-EXECUTE. service_role hat Tabellenrechte und RPC-EXECUTE. Keine selbst gefilterten Tabellen-Policies als zweite Sicherheitsschicht für Nutzerdaten: **Die Function-Projektion ist die Feld-/Objektberechtigungsgrenze.** `verify_jwt=false` am Gateway setzt diese Handler-Prüfung voraus. Keine direkte Übernahme von Browser-Workspaces in `dc_commit` erlauben. Keine separate Indexierung innerhalb der JSON-Felder vorhanden.

Revisionsarten nicht vermischen: `payload.version=1` = Datenformat; SQL `revision` = globaler Commit; Projekt-/Tutor-/Eventrevision = Objektänderung; Schachrevision = Zug-/Partieänderung; Demo `_persistence.revision` = lokaler Speicherstand. `dc_commands` ist Deduplizierung, **kein fachliches Audit**, da Aktion, Inhalt, Ziel, alter/neuer Wert fehlen.

## 6. Workspace und Entitäten

Quellen: `emptyPlatform`, `addAccount`, P/S, `_shared/profiles.js`; vollständige Symbolzeilen im Inventar. `?` bedeutet optional; string IDs bleiben opak. JSON-Beziehungen besitzen keine Datenbank-FKs. Demo-Seedfelder sind ausdrücklich keine verbindliche Kontodatenstruktur.

```text
Workspace {version:1, profiles:{[authUuid]:Profile}, participation:{[authUuid]:{[eventId]:status}},
           ideas:Idea[], activities:Event[], schools:School[], modules:Modules}
Modules {blocks:{[id]:id[]}, challenges:Challenge[], chessRead?:{[id]:noticeKey[]},
         games:ChessGame[], groups:Group[], awards:Award[], awardSharing:{[id]:boolean},
         tutoring:Tutoring[], interests:{[id]:string[]}, contactDrafts:ContactDraft[],
         visibility:{[id]:boolean}, messages:Message[], reports:Report[]}
```

| Entität | Tatsächliche Felder und Regeln | Lebenszyklus / Beziehung / Sicht |
| --- | --- | --- |
| Profile | id:string Auth-UUID, displayName:string 2–40, schoolId:string bekannt oder initial leer, interests:category[], customInterests?:string[] <=8 à 40, language:de/tr/en, joinedAt:ISO, profileSharing?:{school?,interests?,projects?:boolean} | Erst beim Plattformaufruf; keine eigene Mail/Telefon-Spalte. Moderatorflag nur Projektion. Schule vom Nutzer änderbar und nicht verifiziert |
| School | id:ers/anka, initials,name,city:string | Katalog in Workspace; Frontend zusätzlich statisch in activities.js. Keine Schulverwaltung/-verifizierung |
| Idea | id,ownerId,schoolId; title 5–90, description 20–1000; category open/technology/science/language/culture; goals 0–600, collaborators 0–400; topics <=8 à 40; desiredSchoolIds:string[]; projectStatus proposal/looking/preparing; initiativeId?:interviews; participantIds/requestedIds/interestedIds:string[]; revision:number; updatedAt?; lifecycle?:active/withdrawn/deleted; completion? | Idee und Projekt im selben Datensatz; keine gesonderte Project-Tabelle/Projektfreigabe. Soft Delete; optionale historische Demo-Felder seedKey/seedIndex/history nicht als Kontoschema exportieren |
| Completion | confirmedBy,confirmedAt,memberIds:string[] | Moderator bestätigt einmal, Mitglieder eingefroren inkl. owner; Datum <=now, nicht withdrawn/deleted für Statistik. Widerruf nicht implementiert |
| ProjectApplication / Membership | **Keine eigene Entität/Zeile**: requestedIds / participantIds an Idea | request→accept/decline, cancel, leave; Interesse separat. Keine Entscheidungszeit/-begründung gespeichert |
| Event | id,ownerId,title,description,detail,category,hostSchoolId,schoolIds:string[],startsAt:ISO,icon:calendar,approval:proposal/confirmed,revision:number,attendance:{[id]:Evidence},updatedAt?; cancelled?:boolean wird gelesen, aber kein Command setzt es | Schüler erstellen proposals; Moderator confirmed; Datum/Absage/Kapazität nicht vollständig steuerbar. `schoolIds` bei Anlage alle Workspace-Schulen |
| Evidence | confirmedBy,confirmedAt:string | Nur confirmed Event, nach Beginn und joined; kein separater Anwesenheitstisch. Reale Beweiskontrolle organisatorisch |
| EventRegistration | participation[userId][eventId]:interested/joined; Demo zusätzlich organized | Null entfernt; organisiert bei echten Konten durch owner abgeleitet. Keine Anmeldezeit/Anwesenheit ableiten |
| Tutoring | id,ownerId,schoolId,revision,updatedAt; kind:offer/request,subject 2–80,topics 3–200,description 20–1000,availability 3–200,languages:de/tr/en[],format:online/school/either,lifecycle?:closed/deleted | request ist **öffentliche Gesuch-Art**, nicht zugestellte Anfrage. Demo zusätzlich subjectKey/seed/history |
| ContactDraft | ownerId,targetId,note 10–600 | Pro Nutzer/Angebot ersetzt, nur Besitzer sichtbar; kein Empfängerstatus und keine Zustellung |
| ModuleInterest | string `initiative:<id>` / `tutoring:<id>` / `person:<id>` in eigener Map | Nur persönliche Vormerkung; kein Support-/Leistungsnachweis |
| Group | id,kind:topic/project/event,memberIds:string[],closed?:boolean,title?,contextId?,ownerId? | topic per Beitritt; project/event dynamisch aus Kontext. Keine persistenten Chatnachrichten als Unterobjekt; Rechte in groupFor berechnet |
| Message | id,ownerId,roomId,body 3–1200,createdAt:ISO | Gruppenbeitrag; sichtbar für Mitglieder oder globale Moderatoren, Blocks beachten; Entfernung löscht Arrayelement |
| Report | ownerId,targetId,targetType:person/message,reason:privacy/inappropriate/spam,createdAt,status:pending/reviewed,reviewedAt? | Zusammengesetzter fachlicher Schlüssel; eigene Meldungen oder Moderator; keine eindeutige Report-UUID |
| Challenge | id,fromId,toId,status:pending/accepted/declined/cancelled,createdAt,gameId? | Nur beide Beteiligte, keine Blockierung; pending kein Ablaufdatum; accepted referenziert exakt erzeugte Partie |
| ChessGame | id,whiteId,blackId,mode:hotseat/challenge,moves:string[],revision:number,status:active/ended,createdAt,drawOffer?:id/null,result?:{winner:w/b/null,reason:string} | Aus Koordinatenzügen rekonstruiert; Hotseat beide IDs gleich; `endedAt` wird vom History-Selector akzeptiert, aber aktuell nicht vom Reducer geschrieben |
| ChessNotification | **Abgeleitet**, kein eigener Store: key,challengeId,kind,otherId,otherName,createdAt,gameId?,finished?,canRead | key `<challengeId>:<kind>`; kind invited/sent/accepted/declined/cancelled, sent nicht ungelesen. Zeit meist Challenge-Erstellzeit, keine eigene Antwortzeit |
| Award | id=`award-<event>-<profile>`,ownerId,eventId,kind:collaboration,awardedBy,awardedAt | Einmal je Event/Person; nur eigene oder explizit geteilt. Öffentlich reduzierte Felder, kein raw Evidence |
| PublicProfile | id,displayName,schoolId,interests,sharing,ownedProjectIds,currentProjectIds,completedProjectIds,awards,counts | Serverseitiger Read Model, nicht separat speichern. Verzeichnisfreigabe plus einzelne Felder, Defaults false |
| LocalGameResult | id:run-…,ownerId,game:memory/flight/runner,score:int 0..1e9,completed:true,completedAt; memory zusätzlich pairs=6,turns>=6 | Nur lokales Spiele-Repository; niemals verifiziertes Online-Ergebnis. Kein ChessGame hier |
| LeaderboardEntry | id,displayName,score,completed,history,rank; chess zusätzliche wins/losses/draws/practice | Zur Laufzeit berechnet, nicht eigene Tabelle; aktuelle echte Konten erhalten kein globales Board |
| RecordHistory | actorId,action,at je Eintrag | Nur kleiner Demo-Verlauf aus recordHistory.js; kein revisionssicheres Backend-Moderationsprotokoll |

## 7. Projektion und Statistikregeln

`projectPlatform` setzt `activeId`, `profileCapabilities=true`, `chessNotificationCapabilities={inApp:true,email:false}`, `moderationAvailable`; liefert private Maps nur für actor, attendance nur eigene oder Moderator. Fremde Profile werden zu freigegebenen Feldern oder kontextbezogenen Namen reduziert. Gruppen-Nichtmitglieder erhalten eine Metadatenhülle ohne memberIds; Nachrichten nur mit Gruppenrecht/Moderation. Partien/Challenges nur Beteiligte. Blocks wirken beidseitig. Moderatorprojektion darf umfassendere private Daten enthalten; Rolle daher niemals aus Client-Metadaten übernehmen.

**Wichtige Lücke DC-I01:** activities wird derzeit nicht nach approval/Eigentum gefiltert. Auch Vorschläge anderer Konten sind im Snapshot und über EventDetails lesbar. Bestehende Auditbeschreibung „unsichtbar“ ist dafür kein verlässlicher Nachweis. Vor Freigabe serverseitige Veröffentlichungsregel und Negativtest ergänzen.

`selectPersonalArea` (`src/data/personalArea.js:8`) berechnet aktuelle Projekte aus Eigentum/angenommener Mitgliedschaft, ohne gültigen Abschluss und ohne gelöschte/zurückgezogene Datensätze. Abschluss setzt gültigen Moderationsbeleg und eingefrorene Mitgliedschaft voraus. Kommende Anmeldung = startsAt>=now, joined, nicht cancelled. Bestätigte Anwesenheit = confirmed Event, Beginn und Belegzeit nicht Zukunft, confirmedBy vorhanden. Auszeichnungen stammen nur aus Serverdaten. `publicProfile` berücksichtigt nur ausdrücklich geteilte Bereiche. Kein Gesamtwirkungs-Dashboard mit erfundenen Kennzahlen vorhanden.

## 8. Speichergrenzen und relationaler Ausbau

| Speicher | Schlüssel / Inhalt | Isolation / Integration |
| --- | --- | --- |
| localStorage Auth | `deutschconnect.auth.<SupabaseHost>`; access/refresh/expires_at | Nie in Manifest/Logs übernehmen; keine Passwortspeicherung; getrennte SDK-Speicherform in Claude |
| localStorage Demo | `deutschconnect.demo.v1`; version 1, `_persistence` | Web-Lock `deutschconnect-demo-write-v1`, sichere Recoverykopien `.recovery.*`; keine Kontomigration |
| sessionStorage Persona | `deutschconnect.demo.persona` | Tab-lokal, kein Login |
| sessionStorage Seite | `deutschconnect.page.v1:<encodedProfile>:<encodedScope>` | Filter, Draft, submission-ID; maximal 24.000 Zeichen, Typprüfung; alte eigene Drafts beim Kontowechsel entfernt |
| localStorage Spiele | `deutschconnect.game-results.v1:<encodedScope>` | scope demo oder account:UUID; version 1, results, sharing; <=2.000.000 Zeichen, Web Locks, keine automatische Cloudübernahme |
| localStorage Sprache | `deutschconnect.language` | de/tr/en; Profil kann Sprache vorgeben |
| localStorage Lesefallback | `deutschconnect.chess-read.v1:<mode>:<encodedId>` | Nur wenn Serverfähigkeit fehlt; kein zweiter Notification-Zähler |
| Cache Storage | `deutschconnect-games-<assetHash>` | Freiwillige Offline-Assets; keine privaten/API-Anfragen cachen |

Workspace ist für einen kleinen Pilot einfach atomar, kostet aber pro Poll Klonen/JSON-Übertragung und pro Write einen Vollsnapshot unter globaler Sperre. Keine Pagination, nur wenige gezielte Größen-/Rategrenzen, wachsende Command-/Spiel-/Nachrichtenarrays. Vorschlag für spätere relationale Überführung (noch nicht implementiert): Profile/Schulen, Ideen, Anträge/Mitglieder, Events/Registrierungen/Belege, Nachhilfe, Gruppen/Mitglieder/Nachrichten, Meldungen, Challenges/Partien, Auszeichnungen, deduplizierte Commands/Audit trennen. IDs explizit mappen, Statusfelder getrennt erhalten, Freigaben default false. Einmaliger kontrollierter Backfill nach Schreibstopp mit Counts/FKs/Negativrechten prüfen; keine dauerhaften unkoordinierten Dual Writes. Wahl des führenden Backends und genehmigter Rollback müssen zuerst feststehen.
