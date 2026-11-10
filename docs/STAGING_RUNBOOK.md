# Staging-Ablauf – DeutschConnect-Staging

Ziel: Migrationen 011–013 und die neuen Funktionen **zum ersten Mal gegen eine echte Datenbank** testen –
in einem eigenen Supabase-Projekt, **nie** im Live-Projekt.

Rollen: **Ege** legt das Projekt an, trägt `.env.staging.local` ein und führt SQL im Dashboard aus.
**Claude** prüft die Verbindung, führt **kein** SQL aus und testet danach die App im Staging-Modus.
Nie nötig und nie anfordern: Datenbank-Passwort, `service_role`-/secret-Key.

---

## 1. Projekt + Zugang (Ege)

1. Supabase → neues Projekt **DeutschConnect-Staging** (eigenes Projekt, nicht ein Branch des Live-Projekts).
   Beim Anlegen die **Data API aktiviert lassen** (Standard) – sonst erreicht die App die Datenbank nicht.
2. Project Settings → API Keys → **Project URL** und **publishable Key** kopieren.
3. Im Projektordner `.env.staging.local` anlegen (steht in `.gitignore`):

   ```
   VITE_SUPABASE_URL=https://<staging-ref>.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   VITE_ENABLE_SIGNUP=true
   ```

4. `.env.local` (Live) **nicht** ändern.

## 2. Verbindung prüfen (Claude, vor jeder Datenbank-Arbeit)

| Schritt | Erwartung |
|---|---|
| `npm run check:staging` | „OK“, Host = `<staging-ref>.supabase.co`, „Unterscheidet sich von .env.local: ja“ |
| Staging-Build prüfen | Bundle enthält den Staging-Host, **nicht** den Live-Host |
| `npm run dev:staging` | Konsole: `[Staging] Supabase-Projekt: <staging-ref>…`, oben rechts „STAGING“ |
| Konsole im Browser | `[Supabase] Verbunden ✓ … RLS blockiert anonyme Zugriffe` bzw. „Tabellen fehlen“ vor den Migrationen |

## 3. Migrationen (Ege, SQL Editor von **DeutschConnect-Staging**)

> **Stand Staging (laut Ege, 2026-11-09): 001–007, 010, 011, 012, 013 erfolgreich ausgeführt.**
> 008 und 009 bewusst ausgelassen. `admin_get_overview_stats()` existiert, Admin-Statistik funktioniert.
> **Keine dieser Dateien erneut ausführen.** Die Tabelle unten bleibt nur als Nachweis der Reihenfolge.
>
> **Nachtrag (laut Ege, 2026-11-10 – von Claude NICHT geprüft):** zusätzlich `014_chat.sql` und `020_chat_read_state.sql`
> ausgeführt. Welche 014-Fassung dort läuft, ist unbestätigt → **014 und 020 nicht erneut ausführen**, sondern zuerst
> prüfen (z. B. ob `chat_create_project_room`, `chat_load_messages` und `chat_mark_read` existieren).
> `staging_verify.sql` prüft nur bis 013. 017, 018, 019 sind **nicht** ausgeführt.

Jede Datei **komplett** öffnen, einfügen, **Run**. Oben im Dashboard vorher prüfen, dass das Staging-Projekt
ausgewählt ist. Bricht eine Datei mit `ABBRUCH: …` ab, wurde nichts geändert → Meldung an Claude, **nicht** weitermachen.

**Unklar, ob eine Datei gelaufen ist?** Nicht erneut ausführen, sondern `staging_verify.sql` laufen lassen und das
Ergebnis an Claude geben. Grund: z. B. `001` legt Tabellen ohne `if not exists` an und bricht bei einem zweiten
Lauf ab; andere Dateien sind wiederholbar – das wird im Einzelfall geprüft.

| # | Datei | Hinweis |
|---|---|---|
| 1 | `001_initial_schema.sql` | legt Schulen `ers` + `anka` an |
| 2 | `002_restrict_registration_update.sql` | |
| 3 | `003_public_school_info.sql` | |
| 4 | `004_ideas_moderation.sql` | **v3** (Repo-Datei seit `c15bfdf`) – sonst bricht 006 ab |
| 5 | `005_admin_role.sql` | |
| 6 | `006_admin_events_ideas.sql` | große Selbstprüfung; prüft 004 v3 zeichengenau |
| 7 | `007_admin_delete_idea.sql` | |
| – | 008, 009 | **nicht** ausführen (bewusst ausgelassen) |
| 7b | `010_admin_overview_stats.sql` | auf Staging **ausgeführt** (Ege, 2026-11-09) – unabhängig von 008, braucht 005 + 006 |
| 8 | `011_tutoring.sql` | |
| 9 | `012_profiles_stats.sql` | |
| 10 | `013_project_members.sql` | braucht 012 |
| 11 | `017_game_leaderboards.sql` | **NEU, noch nicht ausgeführt** – Bestenlisten Papierflug/Brückenläufer; braucht 001 + 012, **nicht** 014–016 |
| 12 | `014_chat.sql` | **laut Ege ausgeführt (nicht geprüft)** – Chatroom inkl. Projekt-/Eventgruppen; braucht 001, 005, 011, 012, 013. Danach ist der Chat **aus**. Details: [CHATROOM.md](CHATROOM.md) |
| 13 | `020_chat_read_state.sql` | **laut Ege ausgeführt (nicht geprüft)** – Lesestand/„ungelesen“; braucht 014. Rückbau: `supabase/rollback/020_chat_read_state_rollback.sql` |
| 14 | `018_event_auto_delete.sql` | **nicht ausgeführt** – Events automatisch löschen; braucht **008** (auf Staging bewusst ausgelassen → vorher entscheiden) und, falls Chat genutzt wird, 014. Details: [EVENT_EXPIRATION.md](EVENT_EXPIRATION.md) |
| 15 | `019_event_auto_delete_cron.sql` | **nicht ausgeführt** – pg_cron jede Minute; nach 018; entfernt den Job aus 009 (009 ist dann nicht mehr nötig) |

Danach **`supabase/tests/staging_verify.sql`** ausführen (nur lesen) → alle Zeilen `ok = true`
(außer „mindestens 1 Admin“, das kommt in Schritt 4).

**Nach 017:** `supabase/tests/017_leaderboard_test.sql` mit drei Testkonten (A, B, C) ausführen. Der Test endet
absichtlich mit `ERROR: TESTERGEBNIS …` und rollt alles zurück; alle Zeilen L1–L22 (inkl. L7b, L7c, L13b: abgelehnte Runde ist verbraucht) müssen `OK` sein.

**Nach 014 (Chat):** `supabase/tests/014_chat_test.sql` mit **fünf** Testkonten ausführen: A, B, C (Schüler:innen),
MOD (normales Konto, wird im Test kurz Moderator:in) und ADM (Admin aus Schritt 4). Endet absichtlich mit
`ERROR: TESTERGEBNIS …`, rollt alles zurück; **alle** Zeilen müssen `OK` sein (lokal: 141 OK, 0 FEHL).
Notabschaltung jederzeit: `update public.chat_config set enabled = false where id = 1;`
Rückbau (löscht alle Chat-Daten): `supabase/rollback/014_chat_rollback.sql`.

Weitere SQL-Tests (alle rollen zurück bzw. arbeiten nur mit Test-Events; Konten jeweils im Dateikopf eintragen):

| Test | Wann | Konten | lokal (Wegwerf-PostgreSQL) |
|---|---|---|---|
| `014_chat_room_access_test.sql` | nach 014 | A, B, C (normal); es muss ein **anderes** Admin-Konto geben | 23 OK |
| `014_group_approval_test.sql` | nach 014 – Gruppen erst nach Admin-Freigabe | A (normal), MOD (wird kurz Moderator:in), ADM (Admin) | 16 OK |
| `020_chat_read_state_test.sql` | nach 014 + 020 – **mit `psql`**, nicht im SQL Editor (siehe Dateikopf) | A, B, C (normal) + anderes Admin-Konto | lokal gelaufen, Ergebnis nicht in der Doku festgehalten |
| `008_event_expiry_rules_test.sql` | nur wenn 008 ausgeführt wird | A (Admin), B (normal) | 17 OK |
| `018_event_auto_delete_test.sql` | nach 018 | A (Admin), B, C (normal) | 29 OK |

## 4. Testkonten (Ege, nur fiktive Inhalte)

| Konto | Schule | Zweck |
|---|---|---|
| A | ERS | Nachhilfe-Angebot, Idee/Projekt-Autor:in, Profil teilen |
| B | Anka Bilim | anfragen, Profil ansehen |
| C | ERS oder Anka | Außenstehende:r (sieht keine Namen) |
| Admin | beliebig | gibt Test-Idee frei |

**Konten nur über die App registrieren** (`npm run dev:staging` → „Registrieren“), **nicht** im Dashboard über
„Add user“: Der Anmelde-Trigger aus 001 braucht Vorname und Schule aus dem Registrierungsformular. Ohne diese Angaben
scheitert das Anlegen mit „Database error creating new user“ (Schule ist Pflichtfeld).

**E-Mail-Bestätigung auf Staging** – eine der beiden Varianten wählen:
- **A (einfach, nur Staging):** Authentication → Sign In / Providers → Email → „Confirm email“ **aus**.
  Im Live-Projekt **nichts** ändern.
- **B:** Bestätigung an lassen. Dann Authentication → URL Configuration: Site URL `http://localhost:5173`,
  Redirect URL `http://localhost:5173/login`. Achtung: Der eingebaute Mailversand von Supabase schickt nur wenige
  Mails pro Stunde und ggf. nur an Adressen von Mitgliedern des Supabase-Teams.

Admin auf Staging festlegen (SQL Editor **Staging**, nachdem das Admin-Konto registriert ist):
`insert into public.admins (user_id, note) select id, 'Staging-Admin' from auth.users where email = '<admin-email>';`

## 5. Tests (Claude, mit den Testkonten im Staging-Modus)

Jeder Test: Aktion → **beide Konten neu laden** → Zustand muss bleiben.

| # | Bereich | Schritte | Erwartung |
|---|---|---|---|
| T1 | Nachhilfe Angebot | A: `/tutoring/new` Angebot (Mathe) | erscheint bei A unter „Meine“, bei B unter „Angebote“ – **ohne Namen**, nur Schule |
| T2 | Kontaktdaten | A: Beschreibung mit E-Mail-Adresse | wird abgelehnt (Browser **und** Datenbank) |
| T3 | Anfrage | B: Angebot öffnen, Nachricht senden | B: „Ausstehend“; A: Anfrage mit Vorname von B |
| T4 | Annahme | A: annehmen + Notiz | nach Neuladen: A und B „Angenommen“; B sieht jetzt Vorname von A + Notiz |
| T5 | Ablehnung | C: anfragen · A: ablehnen | C: „Abgelehnt“ nach Neuladen |
| T6 | Fremd ändern | B: `/tutoring/<id von A>/edit` speichern | Fehler „nicht gefunden“; Eintrag unverändert |
| P1 | Profil privat | B: `/community/people/<id von A>` | „Profil nicht verfügbar“; A nicht im Verzeichnis |
| P2 | Profil teilen | A: `/me/sharing` öffentlich + nur Schule | B sieht Vorname + Schule; **keine** Interessen, Projekte, Zahlen, Klasse, E-Mail |
| P3 | Freigabe zurück | A: öffentlich aus | B nach Neuladen: „Profil nicht verfügbar“ |
| P4 | Statistik | A: „Mein Bereich“ | Zahlen passen zu A's Daten; fehlende Werte „–“ |
| J1 | Projekt anfragen | Admin gibt Idee von A frei · B: Idee → „Mitmachen anfragen“ | B: „Anfrage gesendet“; A: B unter „Offene Anfragen“ |
| J2 | Annehmen | A: annehmen | B: „Du bist Mitglied“ + Team; A: Team mit B |
| J3 | Außenstehend | C: Idee öffnen | nur „1 Mitglied“, **keine** Namen |
| J4 | Austreten | B: „Projekt verlassen“ | B: „Ausgetreten“; Anzahl 0 |
| J5 | Profil-Mitgliedschaft | B: Profil öffentlich + Projekte · C öffnet B | Mitgliedschaft sichtbar (nach J2, vor J4) |
| B1 | Bestenlisten leer | A: `/games` (unter den Spiel-Kacheln) | zwei Listen „Papierflug – Top 10“ / „Brückenläufer – Top 10“ mit „Noch keine Einträge“; Haken „In Bestenlisten anzeigen“ aus |
| B2 | Bestwert | A: `/games/bridge-runner` eine Runde | unter dem Spiel „Neuer Bestwert gespeichert: X“ (keine Liste auf der Spielseite); auf `/games` „Dein Bestwert: X“, A noch **nicht** in der Liste |
| B3 | Zustimmung | A: `/games` Haken an | A erscheint mit Vorname + „Du“; B sieht A nach Neuladen (nur Vorname + Punkte) |
| B4 | Niedriger | A: schlechtere Runde | keine Meldung, Bestwert bleibt |
| B5 | Andere Person | B: Runde + Haken an | beide in der Liste; bei gleichen Punkten gleicher Platz |
| B6 | Spiele getrennt | A: `/games` Papierflug-Liste | Brückenläufer-Werte erscheinen dort nicht |
| B7 | Abgemeldet | abmelden, `/games` und ein Spiel öffnen | `/games`: ein Hinweis „Melde dich an …“ statt Listen; Spiel: kurzer Hinweis, Spielen geht trotzdem |
| B8 | Zustimmung aus | A: `/games` Haken aus | A verschwindet nach Neuladen bei B |
| C0 | Chat aus | A: `/chat` | „Der Chat ist noch nicht freigeschaltet.“ |
| C1 | Einschalten | Admin: `/chat/moderation` → Einstellungen → einschalten (Begründung) | A sieht danach die 4 Themenräume |
| C2 | Raum | A: Raum beitreten, „Hallo zusammen“ senden · B: beitreten | B sieht die Nachricht **ohne Neuladen** (Realtime) mit Name + Zeit |
| C3 | Wortfilter | A: „Du bist ein Arschloch!“ | gespeichert/angezeigt „Du bist ein ***!“; A sieht Hinweis |
| C4 | Kontaktdaten | A: Nachricht mit E-Mail-Adresse | abgelehnt mit verständlicher Meldung |
| C5 | Anfrage | B: Profil öffentlich · A: Profil von B → „Nachricht senden“ | B: Reiter „Nachrichtenanfragen 1“; A kann keine zweite Anfrage senden |
| C6 | Annehmen | B: annehmen, antworten | beide sehen das Gespräch; C findet es nicht (Suche, Link) |
| C7 | Ablehnen + Wartezeit | neue Anfrage C → B (C öffentlich) · B lehnt ab · C fragt erneut | „… ab <Datum> möglich“ |
| C8 | Reaktion + Suche | B: 👍 auf Nachricht von A; Suche „hallo“ | A sieht 👍 1 ohne Neuladen; Treffer nur aus erlaubten Räumen/Chats |
| C9 | Melden + Moderation | B meldet Nachricht · Admin: Meldungen → Zusammenhang, löschen, A 1 h sperren | Audit-Protokoll zeigt alle Schritte; A kann lesen, aber nicht schreiben |
| C10 | Blockieren | B blockiert A | Gespräch für beide weg; A kann B keine Anfrage senden |
| C11 | Handy | alles oben einmal auf einem echten Handy | Bedienung, Lesbarkeit, Tastatur deckt Eingabe nicht dauerhaft ab |
| G1 | Gruppe vor Freigabe | A: neue Idee einreichen (wartet auf Admin) → Ideenseite → „Projektgruppe im Chat anlegen“ | Hinweis „… erst erstellt werden, nachdem ein Admin …“ erst **nach** dem Klick; keine Gruppe entsteht |
| G2 | Gruppe nach Freigabe | Admin gibt die Idee frei · A: erneut anlegen | Gruppe entsteht, A landet im Gruppenraum; zweiter Versuch → dieselbe Gruppe |
| G3 | Community-Gruppen | A und Projektmitglied B: `/community/groups` | Gruppe sichtbar (Filter „Projektgruppen“); C sieht sie **nicht** |
| G4 | Eventgruppe | Moderation: `/chat/moderation` → Räume → Event wählen → „Anlegen“ | nur veröffentlichte Events wählbar; Angemeldete sehen die Gruppe unter `/community/groups` |

Ergebnisse → `docs/INTEGRATION_PROGRESS.md` (Spalte „DB-getestet“ bzw. „Browser-getestet“).

## 6. Danach aufräumen (optional)

Staging-Projekt kann bleiben (für Stufe 7–10). Testkonten enthalten nur fiktive Daten.
