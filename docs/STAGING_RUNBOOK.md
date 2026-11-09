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

Danach **`supabase/tests/staging_verify.sql`** ausführen (nur lesen) → alle Zeilen `ok = true`
(außer „mindestens 1 Admin“, das kommt in Schritt 4).

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

Ergebnisse → `docs/INTEGRATION_PROGRESS.md` (Spalte „DB-getestet“ bzw. „Browser-getestet“).

## 6. Danach aufräumen (optional)

Staging-Projekt kann bleiben (für Stufe 7–10). Testkonten enthalten nur fiktive Daten.
