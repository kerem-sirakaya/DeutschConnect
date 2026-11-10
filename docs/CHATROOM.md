# Chatroom – Architektur, Sicherheit, Betrieb

Stand: 2026-11-09 · Branch `integration-v1` · Migration `supabase/migrations/014_chat.sql`
**Status: nur im Repository. Weder auf Staging noch auf Live ausgeführt. Nach dem Ausführen ist der Chat AUS.**

Konzepte (Themenräume, Projekt-/Eventgruppen, Melden, Blockieren, Kontaktdaten-Schutz) stammen aus Kerems
Codex-Version (Branch `codex-version-1.0`). Die Speicherung ist **nicht** übernommen: statt eines JSON-Gesamtpakets
mit Edge Function und Service-Role-Schlüssel nutzt der Chat eigene Tabellen, RLS und Datenbank-Funktionen – wie der
Rest von DeutschConnect.

## 1. Funktionen

| Bereich | Was geht |
|---|---|
| Gruppenräume | 4 feste Themenräume (Schulübergreifender Austausch, Nachhilfe und Lernen, Projekte und Zusammenarbeit, Events und Workshops) – beitreten/verlassen. Projektgruppe je veröffentlichter Idee (Autor:in legt an, Mitglieder aus Migration 013). Eventgruppe je Event (Moderation legt an, Mitglieder = Angemeldete). Keine frei erstellbaren Räume. |
| Private Chats | Nur über **Nachrichtenanfrage**: Anfrage mit Vorstellung → Empfänger:in nimmt an / lehnt ab / meldet / blockiert → erst nach Annahme entsteht ein Gespräch. Absender:in kann zurückziehen. |
| Nachrichten | Text (1–1000 Zeichen), Zeitstempel, Anzeigename (Vorname), eigene löschen, Realtime-Aktualisierung |
| Reaktionen | 👍 ❤️ 😂 😮 😢 👏 – an/aus, Anzahl, eigene markiert |
| Suche | Nur in Räumen, in denen man Mitglied ist, und in eigenen, nicht blockierten Gesprächen; Groß-/Kleinschreibung egal; max. 30 Treffer |
| Wortfilter | Serverseitig, DE/TR/EN, vor dem Speichern; nur die zensierte Fassung wird gespeichert |
| Melden / Blockieren | Nachricht, Person, Raum, Gespräch, Anfrage melden (6 Gründe). Blockieren beidseitig wirksam. |
| Moderation | Meldungen bearbeiten, Nachrichten löschen, Räume archivieren/löschen, Gespräche archivieren/löschen, zeitlich begrenzte Sperren (global / Raum), Audit-Protokoll, Einstellungen, Moderator:innen, Wortliste |

Bewusst **nicht** umgesetzt: Online-Status, „schreibt gerade“, Lesebestätigungen, „zuletzt gesehen“, Profilbilder im
Chat, Sprach-/Video-/Datei-/Bild-Nachrichten, Sticker, Anheften, komplexe Benachrichtigungen. Einzige Anzeige: Zahl
offener eingehender Anfragen am Reiter „Nachrichtenanfragen“.

## 2. Datenmodell (Migration 014)

| Tabelle | Zweck | Wichtige Regeln |
|---|---|---|
| `chat_config` | genau 1 Zeile: `enabled` (Standard **false**), Wartezeit nach Ablehnung (Standard **168 h = 7 Tage**), Anfragen/Tag (10), Nachrichten/Minute (10) | nur Admins ändern (Funktion) |
| `chat_moderators` | Moderator:innen | nur Admins tragen ein |
| `chat_rooms` | Themenräume (`slug`), Projektgruppen (`idea_id` eindeutig), Eventgruppen (`event_id` eindeutig), `archived_at` | Prüfregel: genau ein Ziel je Art; `event_id` **ON DELETE RESTRICT** (Event-Löschen nimmt keine Nachrichten mit; Event-Ablauf archiviert nur – siehe [EVENT_EXPIRATION.md](EVENT_EXPIRATION.md)) |
| `chat_room_members` | Mitgliedschaft nur für Themenräume | Projekt/Event: abgeleitet aus `idea_members` / `event_registrations` |
| `chat_conversations` | privates Gespräch | `user_a < user_b` + eindeutiges Paar → genau 2 Personen, höchstens 1 Gespräch je Paar |
| `chat_requests` | Nachrichtenanfragen (`pending/accepted/declined/cancelled/blocked`) | eindeutiger Index: höchstens 1 offene Anfrage je Paar (in beide Richtungen) |
| `chat_messages` | Nachrichten (Raum ODER Gespräch), `body` immer zensiert, weiches Löschen (`deleted_at`, Text leer) | Fremdschlüssel cascade |
| `chat_reactions` | Reaktionen | Primärschlüssel (Nachricht, Person, Emoji); feste Emoji-Liste |
| `chat_blocks` | Blockierungen | wirkt in beide Richtungen |
| `chat_bans` | Sperren `global`/`room`, Grund, von wem, Beginn, Ende, vorzeitiges Ende | Ablauf wird bei jeder Prüfung automatisch erkannt (`ends_at > now()`) |
| `chat_reports` | Meldungen inkl. **Beweis-Kopie** (`evidence`) | Verweise `on delete set null` → Meldung bleibt beim Löschen erhalten |
| `chat_audit_log` | Protokoll aller Moderations-/Admin-Aktionen | nur Funktionen schreiben, nur Staff liest |
| `chat_terms` | Wortliste (normalisiert, „exakt“ oder „Wortanfang“) | nur Admins |

Abhängigkeiten: 001 (Profile, Ideen, Events), 005 (`admins`), 011 (`dc_has_contact_data`), 012 (`profile_sharing`),
013 (`idea_members`). **Nicht** nötig: 008–010, 015–017.

## 3. Sicherheit

- **Schreiben nur über Datenbank-Funktionen** (`SECURITY DEFINER`, `search_path = ''`). Jede Funktion ermittelt die
  Person selbst über `auth.uid()`; der Browser übergibt nie die eigene ID.
- **RLS auf allen 13 Tabellen.** Direkter Zugriff: keine Schreibrechte für `anon`/`authenticated`. Nur 5 Tabellen
  haben **Lese-Policies** – ausschließlich für Supabase Realtime:
  `chat_messages` (nur sichtbare Nachrichten: Raum-Mitglied/Staff ohne Blockierung bzw. Gesprächsbeteiligte ohne
  Blockierung), `chat_reactions` (nur zu sichtbaren Nachrichten), `chat_requests` (nur eigene),
  `chat_conversations` (nur eigene), `chat_room_members` (nur eigene Zeilen). Alle anderen Tabellen: keine Policies,
  keine Rechte.
- **Anfrage ≠ Gespräch:** Ein Gespräch entsteht ausschließlich in `chat_respond_request` (Annahme durch die
  Empfänger:in). Vorher gibt es nichts zu lesen oder zu schreiben.
- **Doppelte Gespräche/Anfragen** verhindert die Datenbank (eindeutige Indizes) – auch bei gleichzeitigen Anfragen.
- **Sperren und Blockierungen** werden in jeder Schreib-Funktion geprüft (Nachricht, Anfrage, Annahme, Reaktion,
  Projektgruppe). Ein direkter API-Aufruf umgeht sie nicht.
- **Rollen:** Admin = Eintrag in `public.admins` (005). Moderator:in = Eintrag in `chat_moderators` (nur Admins).
  Profilfelder, Browser-Speicher oder Anfragen können keine Rolle verleihen.
- **Private Inhalte für Admins:** nicht allgemein lesbar. Gespräche erscheinen in der Verwaltung nur als Metadaten.
  Inhalte nur (a) als Beweis-Kopie einer Meldung oder (b) als Zusammenhang einer Meldung über
  `chat_mod_report_context` – mit Pflicht-Begründung und **immer protokolliert** (`view_private_context`).
  Private Nachrichten darf Moderation nur löschen, wenn sie gemeldet wurden.
- **Kontaktdaten** (E-Mail, Links, Telefonnummern) werden abgelehnt (wie Nachhilfe, 011).
- **Meldende bleiben anonym** gegenüber Gemeldeten (Meldungen lesen nur Staff).
- Kein Service-Role-Schlüssel im Frontend; keine Edge Function nötig.

### Rechte-Matrix (geprüft in `supabase/tests/014_chat_test.sql`)

| Aktion | Abgemeldet | Schüler:in | Raum-Mitglied | Gesprächs-Beteiligte | Moderation | Admin |
|---|---|---|---|---|---|---|
| Chat-Funktionen aufrufen | ✘ | ✔ (wenn eingeschaltet) | ✔ | ✔ | ✔ (auch wenn aus) | ✔ (auch wenn aus) |
| Raum lesen/schreiben | ✘ | nur nach Beitritt | ✔ | – | lesen ✔ | lesen ✔ |
| Privates Gespräch lesen | ✘ | ✘ | ✘ | ✔ (ohne Blockierung) | nur Meldung + protokollierter Zusammenhang | wie Moderation |
| Fremde Nachricht löschen | ✘ | ✘ | ✘ | ✘ | Räume ✔, privat nur gemeldet | wie Moderation |
| Meldungen lesen | ✘ | ✘ | ✘ | ✘ | ✔ | ✔ |
| Sperren | ✘ | ✘ | ✘ | ✘ | bis 7 Tage | bis 365 Tage |
| Raum archivieren | ✘ | ✘ | ✘ | ✘ | ✔ | ✔ |
| Raum / Gespräch löschen | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ |
| Moderator:innen, Wortliste, Einstellungen | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ |
| Admins ernennen | nur im SQL Editor (Tabelle `admins`) | | | | | |

## 4. Wortfilter

- Läuft **in der Datenbank** (`chat_censor`) in `chat_send_room_message`, `chat_send_conversation_message`,
  `chat_send_request` (und Meldungs-Notizen). Gespeichert und ausgeliefert wird nur die zensierte Fassung.
  Die Absender:in sieht „Einige Wörter wurden automatisch ersetzt“.
- Normalisierung: Unicode (NFKD) ohne Akzente, ß→ss, ı/İ→i, kyrillische Doppelgänger, Ersatzzeichen
  (0→o, 1→i, 3→e, 4→a, 5→s, 7→t, @→a, $→s, !→i, 8→b), nur a–z, Wiederholungen zusammengefasst.
- Erkennt: Groß-/Kleinschreibung, Umlaute/türkische Buchstaben, Wiederholungen („Fuuuck“), Ersatzzeichen
  („4rschl0ch“, „sh!t“), Punkte zwischen Buchstaben („a.r.s.c.h“), Leerzeichen zwischen Einzelbuchstaben
  („f u c k“), angeklebte Wörter („du-idiot“).
- Wortgrenzen: „exakt“ (ganzes Wort) oder „Wortanfang“ (Zusammensetzungen, z. B. „arsch“ → „Arschloch“).
  Mehrdeutige Wörter (z. B. „dick“, „got“, „pic“, „mal“, „göt“) stehen bewusst nicht auf der Liste.
- Bekannte Grenzen: Satzbedeutung wird nicht verstanden; ein Wort-Anfang-Eintrag kann seltene harmlose Wörter
  treffen (z. B. „fick“ → „Fickel“); neue Schreibweisen müssen Admins nachtragen. **Kein Ersatz für Moderation.**
- Das Protokoll speichert beim Pflegen der Liste nicht das Wort selbst (nur die Länge).

## 5. Abläufe

**Nachrichtenanfrage:** Profil (öffentlich, Migration 012) → „Nachricht senden“ → Vorstellung → Anfrage
(`pending`). Empfänger:in: Reiter „Nachrichtenanfragen“ → Annehmen (Gespräch entsteht, Vorstellung wird erste
Nachricht) · Ablehnen (Absender:in wartet 7 Tage, einstellbar) · Melden · Blockieren (beendet die Anfrage).
Gegenrichtung während einer offenen Anfrage: Hinweis „hat dir schon eine Anfrage geschickt“.
Nur Personen mit **öffentlichem Profil** können Anfragen erhalten.

**Meldung → Moderation:** Meldung (mit Beweis-Kopie) → `/chat/moderation` → Zusammenhang ansehen (protokolliert) →
Nachricht löschen / Person sperren / erledigt / verworfen (jeweils mit Begründung, protokolliert).

**Sperren:** Person, Bereich (ganzer Chat / ein Raum), Dauer (1 h, 24 h, 3 d, 7 d, 14 d, 30 d, eigene),
Begründung, Bestätigung. Gesperrte lesen weiter, können aber nicht schreiben, reagieren, Anfragen senden/annehmen
oder Projektgruppen anlegen. Ablauf automatisch; vorzeitiges Beenden mit Begründung.

**Löschen vs. Archivieren:** Archivieren = nur noch lesen, Daten bleiben, rückgängig machbar. Löschen (nur Admins) =
endgültig, Nachrichten + Reaktionen weg, beide Beteiligten verlieren den Zugriff; Meldungen samt Beweis-Kopie bleiben.

## 6. Frontend

Routen: `/chat` (Reiter Gruppenräume · Private Chats · Nachrichtenanfragen · Suche), `/chat/rooms/:id`,
`/chat/conversations/:id`, `/chat/moderation` (nur Staff, nachgeladen). Einstieg: erste Karte auf `/community`;
`/chat` markiert „Community“ in der Navigation; Admins zusätzlich im Admin-Bereich („Chat-Moderation“).
„Nachricht senden“ auf öffentlichen Profilen; „Projektgruppe“ im Team-Bereich eines Projekts.

Dateien: `src/lib/chat.js`, `src/lib/chatApi.js`, `src/state/useChat.js`, `src/components/chat/*`,
`src/pages/Chat*.jsx`, `src/styles/chat.css`.

**Beitreten / Raum betreten / Verlassen** (Themenräume, `RoomActionButtons.jsx`, Regel `roomActions()` in `chat.js`):
- kein Mitglied: nur „Beitreten“. Die Raumseite zeigt dann nur Name, Beschreibung und „Beitreten“ – keine Nachrichten,
  keine Mitgliederliste (gesperrt, sobald die Datenbank `DC042` meldet; Moderation darf weiter mitlesen).
- Mitglied: „Raum betreten“ (öffnet `/chat/rooms/:id`) + „Verlassen“ (danach zurück zur Übersicht, kein Zugriff mehr).
- Projekt-/Eventgruppen: kein Beitreten/Verlassen – Mitglied ist, wer im Projekt-Team bzw. verbindlich angemeldet ist.
- Raumansicht: Name + Beschreibung oben, Verlauf mit Profilbild-Kürzel in der Profilfarbe (`avatar_color`, kommt als
  `sender_avatar_color` aus den Nachrichten-Funktionen), Name, Zeit; Eingabe + „Senden“ unten; Anzeige „Live“ bzw.
  „Aktualisiert regelmäßig“ (Realtime bzw. Fallback-Neuladen).
- Rechte prüft ausschließlich die Datenbank: Lesen/Senden über die SECURITY-DEFINER-Funktionen
  (`chat_can_read_room`, `chat_is_room_member`), direkter Tabellenzugriff/Realtime über die RLS-Policy auf
  `chat_messages` (`chat_message_visible`). Die Knöpfe sind nur Anzeige.

**Realtime:** Die App abonniert Änderungen an `chat_messages`, `chat_reactions`, `chat_requests`,
`chat_conversations`, `chat_room_members` und lädt dann über die geprüften Funktionen neu (Signal-Inhalt wird nicht
angezeigt). Welche Signale ankommen, entscheiden die RLS-Policies. Fallback: alle 20 s neu laden, wenn Realtime nicht
verbunden ist (sonst alle 60 s). Die Migration trägt die 5 Tabellen in `supabase_realtime` ein.

## 7. Ersten Admin festlegen (Staging)

Nur im SQL Editor (nie über die App):
```sql
insert into public.admins (user_id, note)
select id, 'Staging-Admin' from auth.users where email = '<admin-email>';
```
Moderator:innen danach in der App: `/chat/moderation` → Einstellungen → „Zur Moderation ernennen“.

## 8. Chat ein- und ausschalten

- **Einschalten:** `/chat/moderation` → Einstellungen → „Chat … einschalten“ (Begründung). Wirkt nur, wenn
  mindestens eine Person mit Moderationsrechten existiert.
- **Notabschaltung:** dieselbe Einstellung aus – oder im SQL Editor:
  `update public.chat_config set enabled = false where id = 1;`
  Alle Schüler:innen-Funktionen melden sofort „noch nicht freigeschaltet“; Daten bleiben erhalten.

## 9. Rückbau

`supabase/rollback/014_chat_rollback.sql` entfernt alle Chat-Tabellen und -Funktionen (inkl. Daten!) und nimmt die
Tabellen aus der Realtime-Veröffentlichung. Andere Tabellen bleiben unberührt. Vorher Meldungen/Protokoll exportieren,
falls nötig. Lokal getestet: Rückbau → keine `chat_`-Objekte mehr, 001–013/017 unverändert → 014 erneut einspielbar.

## 10. Tests

- `npm test` → `tests/chat.test.js` (Logik, API-Aufrufe, statische Prüfungen der Migration), `tests/i18n.test.js`.
- `supabase/tests/014_chat_test.sql` – Staging, 5 Testkonten, endet mit `TESTERGEBNIS` und rollt alles zurück.
  Lokal (Wegwerf-PostgreSQL 18 mit Supabase-Nachbildung) ausgeführt: 141 Prüfungen OK, 0 FEHL.
- `supabase/tests/014_chat_room_access_test.sql` – 3 normale Testkonten (+ ein anderes Admin-Konto muss existieren):
  Beitreten, Raum betreten, Nicht-Mitglied (Funktionen UND direkter SELECT), Senden/Empfangen, Verlassen,
  Wiederkommen, Eventgruppen (inkl. Erhalt nach automatischem Löschen, falls 018). Lokal: 23 × OK.
- `npm test` → `tests/chatRoomAccess.test.js` (Knopf-Regel, Profilfarbe, Verdrahtung, Texte DE/TR/EN).

## 11. Offene Entscheidungen

1. **Aufbewahrungsdauer** von Nachrichten (derzeit unbegrenzt, keine automatische Löschung).
2. **Wer moderiert**, wie schnell wird auf Meldungen reagiert, Vertretung.
3. ~~**Navigation:** Chat als Karte unter Community (Vorschlag) oder eigener 7. Hauptpunkt (wird auf Handys eng).~~
   **Entschieden (Ege, 2026-11-10):** „Chatroom“ ist **dauerhaft ein eigenständiger siebter Hauptbereich**
   (`/chat`, in der Navigation vor „Spiele“; `src/components/layout/navigation.js`). Die mobile Navigation mit sieben
   Einträgen ist auf schmalen Handys eng – sie wird **später separat** verbessert (eigene Aufgabe, noch offen).
4. **Verlauf für neue Mitglieder:** derzeit sehen neue Raum-Mitglieder den ganzen bisherigen Verlauf.
5. **Namen in Themenräumen:** Vorname der Schreibenden und Mitgliederliste sind für Raum-Mitglieder sichtbar.
6. **Wer kann angeschrieben werden:** derzeit nur Personen mit öffentlichem Profil.
7. **Wartezeit** nach Ablehnung (7 Tage), Limits (10 Anfragen/Tag, 10 Nachrichten/Minute).
8. **Sperrgrenzen:** Moderation bis 7 Tage, Admins bis 365 Tage.
9. **Ungelesen-Markierung und Vorschau in Gruppenräumen (Vorschlag, NICHT umgesetzt – braucht Freigabe).**
   Heute gibt es **keinen** Lesestatus. Die Übersicht zeigt deshalb nur die echte Zeit der letzten Nachricht
   (`chat_list_rooms().last_message_at`, nur für Mitglieder) und in privaten Chats Text + Zeit der letzten Nachricht
   (`chat_list_conversations()`). Ein Ungelesen-Punkt wird bewusst nicht „geraten“.
   Kleinster sicherer Weg (als Ergänzung in 014, solange 014 noch nirgends ausgeführt ist):
   - Tabelle `chat_read_state(user_id, room_id | conversation_id, last_read_at)` – RLS an, keine direkten Rechte.
   - `chat_mark_read(p_room, p_conversation)` (security definer): setzt `last_read_at = now()` nur, wenn
     `chat_can_read_room` / `chat_can_read_conversation` erlaubt. Aufruf beim Öffnen eines Raums/Gesprächs,
     **nicht** in der Übersicht.
   - `chat_list_rooms()` / `chat_list_conversations()` liefern zusätzlich `has_unread` (neueste nicht gelöschte
     fremde Nachricht > `last_read_at`) und – nur bei Lesezugriff – `last_body` + `last_sender_name`
     (ein `left join lateral … limit 1`, wie bei den Gesprächen; keine Volltabellen-Abfrage).

## 12. Lesestand im Frontend (Migration 020)

- **Laden:** Raum- und Gesprächsseite laden über `chat_load_messages` (Nachrichten + Lese-Token in einer Abfrage).
  Fehlt 020 in der Datenbank (z. B. Live), lädt die App wie bisher über `chat_room_messages` /
  `chat_conversation_messages` – ohne Token, ohne Punkte (einmal pro Sitzung geprüft).
- **Markieren:** `MessageList` meldet nach dem Anzeigen `onDisplayed` → `chat_mark_read(token)` – nur wenn das Token
  zum gerade offenen Raum/Gespräch gehört, der Tab sichtbar ist und das Token noch nicht versucht wurde
  (`canMarkRead`). Die Übersicht markiert nie. Abgelaufen (DC061) → einmal neu laden; DC060/DC062/DC042 → ignorieren.
- **Übersicht:** `chat_inbox_state` → Vorschau „Name: Text“ / „Du: Text“, Zeit, kleiner Punkt bei `has_unread`.
  Lädt neu bei neuen Nachrichten (Realtime + 20/60-s-Sicherheitsnetz) und nach jedem erfolgreichen Markieren.
- Tests: `tests/chatReadState.test.js` (Logik + Verdrahtung), Datenbank: `supabase/tests/020_chat_read_state_test.sql`.
