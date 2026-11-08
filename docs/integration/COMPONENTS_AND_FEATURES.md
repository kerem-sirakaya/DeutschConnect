# Codex: Komponenten und Funktionsmatrix

Stand 8. November 2026. [Blueprint](../CODEX_INTEGRATION_BLUEPRINT.md), [API/Modelle](API_AND_DATA_MODELS.md), [Inventar mit Symbolzeilen](CODEX_SOURCE_INVENTORY.json), [Manifest mit direkten Imports und Props](CODEX_INTEGRATION_MANIFEST.json).

Alle folgenden Pfade sind relativ zur Repositorywurzel. **L** = gut extrahierbar, **M** = Adapter nötig, **H** = eng gekoppelt. Ausgabe einer React-Komponente ist grundsätzlich JSX; zusätzliche Ausgaben/Seiteneffekte sind genannt. Imports, exportierte Signaturen und verwendete Hooks jeder JSX-Datei stehen maschinenlesbar im Manifest. Damit wird z. B. ein callbackloser `PageIntro` nicht mit einem datenladenden `MyArea` gleichgesetzt.

## Einstieg, Provider und Servicegrenzen

| Datei / wichtige Funktion | Eingaben → Ausgaben / Verantwortung | State / direkte Dienste / Risiko |
| --- | --- | --- |
| `src/main.jsx` | window.location/history → einmaliger bereinigter Callback, React-Root | H: Reihenfolge capture→Language→Account→Demo→App ist Auth-relevant |
| `src/App.jsx:App,AppContent` | Demo-/Sprachkontext, Hash → Seiten-JSX | H: Hashlistener, Scroll/Fokus, Seitenschlüssel, Notificationprovider; nicht zusätzlich zum BrowserRouter betreiben |
| `src/state/AccountContext.jsx:AccountProvider` | children,initialCallback → AccountContext mit user/state/error/loading/syncing/confirmation/profileFailure, dispatch/reload/Authaktionen | H: Supabase-Service, Queues/generation/revision, Polling, überprüfte Weiterleitung; transport- und projektionstreu übernehmen |
| `src/state/DemoContext.jsx:DemoProvider` | children, Konto-/Sprachkontext → state/profile/activities/access/participation, dispatch/updatePreferences/switchProfile und Recoveryfunktionen | H: createLocalRepository versus AccountContext, Sprache aus Profil, tablokale Persona, Recovery-Gate |
| `src/state/ChessNotificationContext.jsx:ChessNotificationProvider` | children, state/profile/access/dispatch → events/unread/markRead/receiptFailed/synchronized | H: abgeleitete Challengeereignisse, private Server-/Fallbacklesemarkierungen, Konto-/Modus-Key |
| `src/games/GameResultsContext.jsx:GameResultsProvider` | children, Konto-/Demoprofil → data/available/record/share | H: lokales createGameRepository, scope=demo/account:ID, bei echten Konten kein öffentliches share |
| `src/games/GameResultsContext.jsx:useResultRecorder` | Context, gültiger Run → save/notice/unsaved | M/H: stabile Run-ID, pending Map, Wiederholung, Navigationsschutz; keine gesonderten gewonnen-Zähler |
| `src/i18n/LanguageContext.jsx:LanguageProvider,LanguageOverride` | children; Override zusätzlich transform → language/setLanguage/t | M: lokale Sprache, navigator-Fallback, title/meta/lang; accountCopy transformiert Gasttexte |
| `src/services/supabase.js:createSupabaseService` | config,fetcher,storage,locks,location,history,initialCallback → gekapselte Auth-/platform-Methoden | H: keine React-Abhängigkeit, aber eigener Sitzungs-/Callbackvertrag; nicht parallel zum Claude-SDK als zweite Auth führen |
| `src/services/authCallback.js:captureAuthCallback` | location/history → none/tokens/otp/error, URL-Bereinigung | M/H: einmalig vor Router; Tokenobjekt niemals in Props-Debugger/DOM/Manifest loggen |

## Wiederverwendbare UI und fachliche Controls

| Pfad / Exporte | Props / Eingaben | Ausgabe / Verhalten / State | Dienste / Kopplung / Übernahme |
| --- | --- | --- | --- |
| `src/components/UI.jsx` | LinkButton: href/children/secondary/className; StatusBadge: children/muted; SectionHeading: eyebrow/title/description/href/link; PageIntro: eyebrow/title/description; EmptyState: text/href/action/icon; SearchField: value/onChange/label; ModuleTabs: items/label | Links, Badge, Überschriften, Leerzustand, Suche; ModuleTabs scrollt aktives Element; DemoNotice liest t | L/M: Icon/CSS, teilweise Sprache; hrefs auf Zielrouter adaptieren |
| `src/components/FormFields.jsx:TextField,CheckOptions` | TextField: id/name/label/value/onChange/Längen/required/multiline/error/hint/autocomplete/disabled; CheckOptions: id/legend/options/value/onChange/error/hint | Kontrollierte Felder, Fehler-IDs/aria-describedby, Checkboxauswahl; keine eigene Persistenz | L: CSS und Callback-Adapter, keine Services |
| `src/components/Icon.jsx:Icon` | name,size,className | Inline-SVG, dekorative Darstellung | L: eigene Icon-Namenliste/CSS, keine externen Assets |
| `src/components/ContentManagement.jsx` | editHref,inactive,inactiveLabel,onWithdraw,onDelete | Kontextuelle Bearbeiten-/Schließen-/Löschenbedienung, Bestätigung/Busyzustand | M: Callback-Rückgaben und Sprachtexte erhalten |
| `src/components/ActivityStatistics.jsx` | counts,publicView | Benannte Werte aus übergebenem Read Model, kein Zählerschreiben | L/M: Übersetzungsschlüssel; keine ungeteilten Counts hineingeben |
| `src/components/BackLink.jsx` | fallback | History.back bei bekannter Vorgeschichte, sonst safeReturnTo-Link | H: Browserhistory-/Routeradapter nötig |
| `src/components/Navigation.jsx:Header,Navigation,LanguageSwitcher` | page bei Header/Navigation; Context bei Sprache | Gemeinsame Hauptziele, aktive Links, Demo-/Kontohinweis, Profilwechsel, Sprache speichern | H: useDemo/useLanguage, NavigationGuard, Glocke, Hashlinks; komplette Shell nur einmal |
| `src/components/ModuleNavigation.jsx` | active | DiscoverNavigation/CommunityNavigation erzeugen ModuleTabs | M: lokalisierte Hashziele auf Zielrouter mappen |
| `src/components/HeroSection.jsx` | Context | Home-Hero und Schnellzugriffe | M: t/useDemo/Linkziele/CSS, keine eigene API |
| `src/components/SchoolCard.jsx` | school,compact | Schulkarte mit Navigation | M: Schule und Texte aus aktuellem Katalog, keine Partnerschaft erfinden |
| `src/components/EventCard.jsx` | activity,recommended,returnTo | Status/Anmeldung/Datum/Empfehlung, Detail-Link | M: useDemo/useLanguage, activities-Selektoren; startsAt/approval statt Claude start/status |
| `src/components/IdeaCard.jsx:IdeaCard,ideaContent` | idea,returnTo; Hilfsfunktion idea,t | Projektkarte, Seed-/Nutzerinhalt, Profil-/Detail-Link | M/H: Demo-Seedfelder und Projektshape, Mitglieds-/Lifecyclevertrag |
| `src/components/TutoringCard.jsx` | record,returnTo | Nachhilfekarte | M: lokalisierter Seed-/Nutzerinhalt, owner/ProfileLink, eigener Tutor-Shape |
| `src/components/CommunityCards.jsx:MemberCard,MessageCard,MemberActions` | member bzw. message/showRoom | Freigegebene Person, Gruppenbeitrag, Block/Melden/Einladen | H: useDemo, ProfileLink, ReportControl, ActionButton, Rechte-/Sichtprojektion |
| `src/components/ActionButton.jsx` | action,children,secondary,onSuccess,disabled | dispatch→bestätigter Erfolg/Fehler, Doppelclickschutz | H: useDemo.dispatch muss Promise<boolean> liefern; kein Optimismus als Speicherung |
| `src/components/InterestToggle.jsx` | targetType,targetId,label,withdraw,disabled | Eigene Vormerkung umschalten, Busy-/Fehlermeldung | H: modules.interests und toggleModuleInterest; keine Nachricht daraus machen |
| `src/components/ParticipationControl.jsx` | eventId | interested/joined/null, Bestätigungsstatus, Busy/Feedback | H: participation Map und Event-approval; aktuelle Zeitlücke DC-I02 übernehmen vermeiden |
| `src/components/ProjectParticipation.jsx` | idea | Interesse/Antrag/Review/Austritt je Rolle | H: requestedIds/participantIds/owner, Revision/expectedRecord, dispatch |
| `src/components/ProfileLink.jsx` | id | Link nur bei freigegebenem publicProfile, sonst Name/Text; interner Kontext-Rückweg | H: selectPublicProfile, useDemo/useLanguage, Hash/from-Logik |
| `src/components/ProfileSchoolNotice.jsx` | Context | Hinweis/Link zur Schulauswahl | M: Schule noch nicht verifiziert, nur eigene Angabe |
| `src/components/ReportControl.jsx` | targetType,targetId | Grund auswählen, report speichern, Busy/Feedback | H: tatsächlicher Ziel-/Rechtevertrag, kein allgemein offenes Adminformular |
| `src/components/PersistenceNotice.jsx` | DemoContext | Storageblockade/Recovery, neu laden/exportieren | H: lokales Repository/Blobdownload, keine Cloudwiederherstellung behaupten |
| `src/components/AccountStatus.jsx` | AccountContext | Verbindung/Fehler, koordinierte Retrybedienung | H: reload/syncing/error, keine Auth-Zustände aus Demo ableiten |
| `src/components/AccountRecovery.jsx` | AccountContext/LanguageContext | Authprüfung oder Profilvorbereitung, bereinigter HTTP-/Fehlercode, Retry, regulärer Login, optional Logout | H: Accountseite einbettbar, kein useDemo nötig; wichtig gegen Profil-Lade-Sackgasse |
| `src/components/ConfirmationNotice.jsx` | AccountContext/LanguageContext | Fehler, reine Bestätigung oder explizite Kontowahl; busy/failed | H: accept/dismissConfirmation, keine Tokens anzeigen, kein stiller Switch |
| `src/components/ChessInvitations.jsx:ChessNotificationLink,ChessNotificationBanner,ChessInvitations` | Notification-/Demo-/Sprachkontexte | Glocke, appweiter Hinweis, Inbox mit Annahme/Ablehnung/Abbruch/Partielink und Gelesen | H: Challenge-Read Model, dispatch und markRead; echte E-Mail fehlt |
| `src/components/GameLeaderboard.jsx` | game | Spielauswahl, drei Ansichten, Punkte/Ränge/Historie/Opt-in; lokaler Ansichtszustand/Busy/Historylimit | H: GameResultsContext + useDemo + Selektoren/Filtermemory/Hash; Accountglobal ausdrücklich leer |

## Seitenreferenz

Jede Seite liest mindestens Sprache, die meisten zusätzlich `useDemo`. Browserrequests erfolgen über Kontext/Service und nicht durch beliebige direkte Tabellenzugriffe in den Seiten. **Ausnahmen:** lokale Offlinevorbereitung über `games/offline.js`; Authseite verwendet `useAccount`. Inputs unten sind echte Props; weitere Daten stammen aus den genannten Read Models. JSX allein ist keine übertragbare Datenladegrenze.

| Datei unter `src/pages/` | Props / Ziel / Daten | Schreibausgaben, lokaler State und Übernahmerisiko |
| --- | --- | --- |
| `Home.jsx` | Keine; persönliche Empfehlungen/Quick Actions | Nur abgeleitete Event-/Ideendaten; M, Hero/Karten/Links und Kontextshape |
| `Discover.jsx` | id?; Initiative/Modulübersicht | Vormerkungen/Projektformularbezug, M; statische Initiativen sind keine neuen Backendentitäten |
| `Events.jsx` | mode=my; filterbare Eventliste | Filter category/school/query in sessionStorage; M; DC-I01: keine Publicationfilterung |
| `EventDetails.jsx` | id,returnTo | Teilnahmecontrol und Gruppenanlage; H; Eventmodell/Rechte/Profilverlinkung, keine Publicationprüfung |
| `EventNew.jsx` | Keine; Kontovorschlag | Draft title/description/date/school/category, createEvent, stabile ID, Busy/Fokus/Saveguard; H; Zeitzonenentscheidung |
| `Ideas.jsx` | mode=my | Projektfilter, Karten; M; kein getrenntes Claude-Projectmodell |
| `IdeaDetails.jsx` | id,returnTo | Eigentümerpflege, Beteiligung, Profil-/Gruppenlink; H; Revision/Lifecycle/Completion erhalten |
| `IdeaSubmit.jsx` | initiativeId?,id? | Anlage/Bearbeitung, Draft/Validierung/expectedRecord; H; projectStatus ist Planung, keine Freigabe |
| `Network.jsx` | section=directory,schoolId? | Statische Schulen/Kooperationsinfo; M; keine abgeschlossenen Kooperationen erfinden |
| `MyArea.jsx` | section=overview,view? | Persönliche Read Models/Filter und Unterseiten; H; dispatch an Controls, kein globaler frei gepflegter Zähler |
| `PersonalSettings.jsx` | Keine | Profil-/Freigabe-Draft, expectedProfile, Schulauswahl/Interessen/Sprache/Visibility; H |
| `StudentProfile.jsx` | id,returnTo | Nur autorisierte PublicProfile-Projektion, Karten/Awards/Actions; H; privates Rohprofil darf nicht Ersatzquelle werden |
| `Account.jsx` | allowExistingSignIn=false | signin/signup/resend, nur RAM-Passwort; Busy/Mode/Feldfehler/Bestätigungsnotice/Reauth; H; neuer AccountProvidervertrag |
| `Achievements.jsx` | Keine | Eigene Belege/Awards/Freigabe; H; Moderatornachweis, keine Demoerfolge |
| `Moderation.jsx` | Keine | Rollenprüfung; Eventfreigabe, Attendance/Award, Reportbehandlung, Projektabschluss; H; kleiner bestehender Moderatorbereich, kein umfassender Admin |
| `Tutoring.jsx` | mode=offers | Filter/Matching/Vormerkungen; M/H; Tutor-Read Model und Sprach-/Fachnormalisierung |
| `TutoringDetails.jsx` | id,returnTo | Eigentümerpflege, privater ContactDraft; H; fehlende Zustellung ausdrücklich erhalten |
| `TutoringNew.jsx` | kind=request,id? | Validierung/Draft, submit/updateTutoring, expectedRecord; H; öffentliche Gesuche von Kontaktanfragen unterscheiden |
| `Community.jsx` | section=people,roomId? | Sichtbare Personen/Gruppen/eigene Aktivitäten; Beitragsformular, join/leave/report/block; H; Moderatorlesen nicht Schreibrecht |
| `Games.jsx` | props: kind?,opponent?,gameId? | GameResultsProvider, Spielauswahl, Leaderboard, Offlinevorbereitung; H; Providerscope pro Profil/Modus/Spiel erhalten |
| `About.jsx` | Keine | Statische Projektmission/Begrenzungen; L/M; keine unbelegten Kennzahlen |
| `NotFound.jsx` | Keine | Lokalisierter Leer-/Rückwegzustand; L/M |

## Spielkomponenten

| Datei | Inputs → Outputs | Zustand / Abhängigkeiten / Transfer |
| --- | --- | --- |
| `src/games/ChessLobby.jsx` | initialTarget? + useDemo → startChess/challengeChess/respondChess und Partieöffnung | pending/failed/Zielwahl, Profile/Challenges/Games; H |
| `src/games/ChessBoard.jsx` | id + autorisierte Partie → chessMove/Resign/Draw/OfferDraw | Zugauswahl/Promotion/Brettdrehen/Busy; pure replay/legalMoves/gameStatus; H für Adapter, Regeln L |
| `src/games/MemoryGame.jsx` | Profil/Resultcontext → genau ein pairsResult nach sechs Paaren | Deck/offene Karten/found/turns/Reset; lokale Ergebnisse, M |
| `src/games/ArcadeGame.jsx` | kind flight/runner → arcadeResult pro beendetem Run | requestAnimationFrame, sichtbares SVG/Touch/Space/Pause/Reset, delta clamp; M |
| `src/games/arcade.js` | Szene,dt,input,optionaler random → neue Szene / shuffledPairs | Keine React-/Serverabhängigkeit, L; Physik und Restartinvarianten mit Tests übernehmen |
| `src/games/leaderboards.js` | erlaubte Profile/Sharing/Results/Games → validierte Statistik und Rangliste | Reine Funktionen, L/M; Shape und Vertrauen in Quellen erhalten |
| `supabase/functions/_shared/chess.js` | FEN/Koordinatenzüge/Position → legale Züge/neue Position/Status | Reine Regeln, L; keine ELO/Netzwerkabhängigkeit |

## Funktionsmatrix

Leseschlüssel für **jede** folgende Zeile: Persistenz **W** = private Workspace-API, **D** = lokales Demo-Repository, **R** = lokales Spielrepository, **S** = sessionStorage-Draft/Filter, **A** = Supabase Auth. Status **LOCAL** = vorhandener Code plus erfolgreich wiederholte lokale Modell-/Browserprüfung, Auth/SQL simuliert; **PREPARED** = nur vorbereiteter Ausbau; **MISSING** = nicht implementiert. Kein LOCAL ist eine Live-Zwei-Geräte-Abnahme. Alle Commands, benötigten Felder und Berechtigungen im [API-Anhang](API_AND_DATA_MODELS.md) bilden die verbindliche Detailauflösung dieser Matrix.

| Funktion / Nutzerziel | Dateien / Komponenten | Daten / Commands / Berechtigung | Benachrichtigung / Statistik | Persistenz / Status / Test / Integrationsrisiko |
| --- | --- | --- | --- | --- |
| Registrierung/Bestätigung/Login/Logout/Reload | Account, ConfirmationNotice, AccountRecovery, Auth-Service/Callback/AccountContext | Authidentity, Session, eigenes Profile; signup/verify/token/user/logout; bestätigte Identität, expliziter Kontowechsel | Auth-Mail separat; keine Leistungsstatistik | A+W; LOCAL; auth-confirmation/server-confirmation/E2E; HTTPS-Geräteabnahme offen, doppelte Auth verhindern |
| Gastmodus/Personalisierung | DemoContext, localRepository, demoState | Fiktive Alex/Deniz, eigene Präferenzen; Demo-Reducer/switchProfile | Nur Demoeffekte, keine echten Belege | D+S; LOCAL; demo/state-quality/E2E; Gast-IDs niemals Kontorechte |
| Profil/Interessen/Schule/Sprache | PersonalSettings, Navigation, FormFields | Profile, preferences, expectedProfile; nur eigene Felder | Keine Nachricht; Schule unbestätigt | W/D+S; LOCAL; backend/profiles-statistics/E2E; first_name/displayName und Schule anders |
| Freiwillige Schülerprofile/Verknüpfungen | StudentProfile, ProfileLink, CommunityCards | visibility/profileSharing/PublicProfile, setCommunityVisibility/shareAwards | Nur geteilte Projekt-/Awardzahlen | W-Projektion oder D; LOCAL; profiles-statistics/E2E/Render; keine privaten Profile für Adapter öffnen |
| Persönliche Statistik | MyArea, ActivityStatistics, personalArea | Eigentum/Mitgliedschaft/Completion, participation/Attendance/Awards/Tutoring | Unterschiedene Interessen/Anmeldungen/Leistungen | Abgeleitet W/D; LOCAL; personal-area/profiles-statistics; Statusmapping zuerst |
| Idee erstellen/veröffentlichen/bearbeiten | IdeaSubmit, IdeaCard/Details | Idea; submit/updateIdea; eigene Schule/Eigentum | Auffindbar ohne Freigabe; ownedProjects | W/D+S; LOCAL; backend/E2E; Claude submitted ist privat, Begriff Veröffentlichung klären |
| Projekt zurückziehen/löschen | IdeaDetails, ContentManagement | withdraw/removeIdea, Eigentümer | Gruppe geschlossen, aus aktiver Statistik | W/D; LOCAL; state-quality/backend; Soft Delete vs Claude Hard Delete |
| Projektinteresse/Antrag/Review/Mitgliedschaft | ProjectParticipation | setIdeaInterest/request/cancel/review/leave; owner/Antragsteller/Mitglied | Antrag im Detail, keine globale Glocke; Interesse nicht Mitgliedschaft | W/D; LOCAL; backend/E2E/ personal-area; supports dürfen nicht Mitglieder werden |
| Projektabschluss | Moderation, profiles/publicProfile | confirmProjectCompletion, eingefrorene akzeptierte IDs; Moderator | Abschlusszahlen nur mit Beleg | W, Demo keine echten Belege; LOCAL-Modell; profiles-statistics; Nachweis/Widerruf organisatorisch offen |
| Nachhilfe suchen/Matching | Tutoring, matching, TutoringCard | Tutoring + Sprache/Fach/Themen/Format, private Interessen | Keine Nachricht, persönliche Vormerkung | W/D+S; LOCAL; navigation-matching/modules/E2E; normalisierte Fachschlüssel und sichtbare Schule erhalten |
| Nachhilfe anbieten/Gesuch/verwalten | TutoringNew/Details, ContentManagement | submit/update/close/removeTutoring, Eigentümer | Aktive eigene Angebote/Gesuche zählen | W/D+S; LOCAL; backend/E2E; Gesuch ist eigener öffentlicher Datensatz |
| Kontaktanfrage an Anbieter | TutoringDetails | saveContactDraft, owner+target, note | **Keine Zustellung/Empfang/Antwort**, keine Glocke | Privater W/D-Draft funktioniert; Zustellung MISSING; E2E prüft gerade Nichtzustellung |
| Event vorschlagen/freigeben | EventNew, Moderation, EventCard/Details | createEvent/approveEvent, Profile/Event, Moderatorfreigabe | Eigene Organisation; keine externe Einladung | W+S, Gast nur vorhandene Events; LOCAL mit DC-I01-Lücke; backend/E2E; Claude admin-only Eventanlage abgleichen |
| Event anmelden/zurücknehmen | ParticipationControl/MyArea | participation null/interested/joined; confirmed für joined | Kein Anwesenheits-/Siegbeleg | W/D; LOCAL mit DC-I02; backend/E2E; Zukunft/Kapazität/Cancel fehlen |
| Anwesenheit/Auszeichnung | Moderation, Achievements | confirmAttendance/awardRecognition; Moderator, Zeitpunkt/Anmeldung, zwei angegebene Schulen für Award | Reale persönliche Teilnahme/Award; freiwillig öffentlich | W; LOCAL-Modell, keine echten Veranstaltungen bestätigt; backend/profiles-statistics; Widerruf/Beweise fehlen |
| Gruppen/Mitgliedschaften | Community, groups, groupFor, ActionButton | join/leaveGroup, createProject/EventGroup; topic frei, Kontext abgeleitet | Kein Join-Notification-Service | W/D; LOCAL; backend/E2E/audit; keine manuelle Schattenmitgliedschaft |
| Gruppenchat/Diskussion | Community, MessageCard, ReportControl | post/removeMessage, Message/Group, tatsächliche Mitgliedschaft | Sicht über Polling, kein Push/Direct Message | W/D; LOCAL; http-handler/audit/E2E; Trennung Moderatorlesen/-schreiben erhalten |
| Melden/Moderieren/Blockieren | ReportControl, MemberActions, Moderation | report/resolve/moderateMessage/blockPerson; jeweilige Rolle | Reportliste, keine Mail; Blocks keine Kontosperre | W/D, Moderation nur Konto; LOCAL; backend/E2E; auditierbare Adminrechte ergänzen |
| Schacheinladung annehmen/verbinden | ChessInvitations/Lobby, NotificationContext | Challenge/Game/Leseschlüssel; challenge/respond/read, nur Beteiligte | Appweite Glocke + Antworten + direkte Partie | W/D; LOCAL; chess-notifications/E2E; geschlossene App bekommt noch nichts |
| Externe Einladung per Mail/Push | chessInviteEmail | Vorlage/HTTPS-URL/Idempotenzkey; kein Send-Endpoint | Kein tatsächlicher Versand | PREPARED Mail, Push MISSING; chess-notifications Modelltests; später Opt-in/Queue/Provider nötig |
| Schachspiel/Spielstand | ChessBoard/Lobby, pure chess/social | start/move/resign/draw/offer, Revision/Spieler/Zugrecht | Sieg/Remis/Niederlage, Hotseat separat | W/D; LOCAL; chess-games/leaderboards/E2E; echte Zwei-Gerätepartie offen |
| Symbol Pairs | MemoryGame, pairsResult, ResultRecorder | sechs Paare, run-ID, turns | Jeder Abschluss 1 | R; LOCAL; chess-games/leaderboards/E2E; echte globale Prüfung fehlt |
| Paper Flight | ArcadeGame, stepFlight, flightDifficulty | Szene/run-ID/Score | Maximalscore, graduell höheres Tempo | R; LOCAL; chess-games/leaderboards/E2E Touch; nicht zu Cloud-Summen machen |
| Bridge Runner | ArcadeGame, stepRunner | Szene/run-ID/Score | Maximalscore | R; LOCAL; chess-games/leaderboards/E2E; Mechanik erhalten |
| Alle Bestenlistenansichten | GameLeaderboard/leaderboards | global/school/personal, sharing, Profile/Result/Game | Demo Opt-in, Ties 1/1/3; keine Kontoglobalen | R + W-Schachprojektion; LOCAL Demo/persönlich, echte gemeinsame Boards MISSING; leaderboards/Render/E2E |
| Deutsch/Türkisch/Englisch | LanguageContext, 15 JSON-Dateien, accountCopy | t/language, Profilpräferenz | Keine Nutzermetrik | localStorage/W/D; LOCAL 819 Keys; encoding/check/Render/E2E; Übersetzungsschema adapterfähig machen |
| Offline/Drafts/Browser Zurück | offline/offline-build, pageMemory/routeHistory, BackLink | statische Assets, isolierte Drafts/Filter/History, Locks | Keine Offline-Kontoaktionen | Cache/D/S; LOCAL; state-quality/route-history/check:offline/E2E; Router-/SW-Cutover prüfen |
| Schulnetzwerk/Interviews/Workshops/Austausch | Network/Discover/About, modules/activities | Statischer Pilotkatalog/Initiativen, Vormerkung, Ideenverknüpfung | Keine erfundenen Gesamtwirkungen | Statisch + W/D-Interessen; LOCAL Render/modules; keine Interviewsuche oder Videokonferenz erfinden |

## Übertragungsreihenfolge

Zuerst gemeinsam benannte reine Regeln und Tests; danach UI-Primitives mit einer Theme-/i18n-Übersetzung; anschließend **einen** vertikalen Datenablauf hinter vereinbartem Adapter. Erst danach ganze Seiten. Account-/Demo-Provider, Rollenprojektion, Event-/Projektstatus und Router müssen vor der letzten Stufe entschieden sein. Komponentenübernahme ist kein Anlass, Sicherheitsprüfungen aus dem Server ins Frontend zu verschieben.
