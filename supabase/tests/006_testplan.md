# Testplan für Migration 006 (Admin-Funktionen, Anmelde-Trigger)

Drei Stufen. **Nur Stufe 1 läuft in der Live-Datenbank** – und ist rein lesend.

| Stufe | Wo | Schreibt? | Datei |
|---|---|---|---|
| 1 – Katalog-Prüfung | Live (SQL Editor) | **nein** (nur `SELECT`/`SHOW`) | `006_readonly_checks.sql` |
| 2 – Verhaltenstest in einer Sitzung | **Kopie** (lokal / Staging) | nur vorübergehend, alles wird zurückgerollt | `admin_functions_test.sql` |
| 3 – Gleichzeitigkeit (zwei Sitzungen) | **Kopie** (lokal / Staging) | ja (Test-Event auf der Kopie) | `capacity_concurrency_manual.sql` |

Kopie anlegen (Beispiel lokal): Supabase CLI installieren → `supabase start` → Migrationen `001`–`006`
der Reihe nach einspielen → zwei Test-Konten in der lokalen App registrieren → Konto A in `public.admins`
eintragen (Skript B aus der Admin-Anleitung).

## Stufe 1 – Live, nur lesend (vor und nach 006)

R1–R10 aus `006_readonly_checks.sql`. Erwartet u. a.: `read committed`; Eigentümer `postgres`, RLS an,
FORCE aus; nach 006 genau 11 PERMISSIVE-Policies; PK `(event_id, user_id)`; nur Trigger
`event_registrations_guard`; keine Rechte für `anon`; keine überbuchten Events.

## Stufe 2 + 3 – Szenarien

Konto A = Admin, Konto B = normale:r Schüler:in. „F1/F2“ = zwei psql-Fenster (Stufe 3).

| # | Szenario | Wie | Erwartetes Ergebnis | Test |
|---|---|---|---|---|
| 1 | Normale Anmeldung | B meldet sich für veröffentlichtes, zukünftiges Event an | Erfolg | T26, T42 |
| 2 | Anmeldung für Entwurf | B: insert für `draft`-Event | `42501`; B sieht den Entwurf nicht | T22, T23, T41 |
| 3 | Anmeldung für abgesagtes Event | B: insert nach `cancelled` | `42501` | T40, T50 |
| 4 | `interested` → `registered` | Update bei offenem / abgesagtem / vergangenem / vollem Event | offen: Erfolg; abgesagt/vergangen: `42501`; voll: `DC008` | T50e, T48b, T43b, T50d |
| 5 | `registered` → `interested` | Update, auch bei abgesagtem Event | immer erlaubt (wie bisher) | T48 |
| 6 | Kapazität erreicht | 1 Platz, A belegt; B verbindlich | `DC008`; „interessiert“ bleibt möglich | T50a–T50g |
| 7 | Zwei Transaktionen um den letzten Platz | F1 insert (offen), F2 insert → hängt, F1 commit | F2: `DC008`; bei F1 rollback: F2 Erfolg | K1, K2 |
| 8 | Anmeldung gegen Admin-Platzreduzierung | Reihenfolge a) Anmeldung zuerst, b) Admin zuerst | a) Admin `DC005`; b) Anmeldung `DC008` | K3, T29 |
| 9 | Anmeldung gegen Absage | F1 Admin cancelled (offen), F2 insert → hängt, F1 commit | F2: `42501` | K4 |
| 10 | Admin vs. Nicht-Admin | B ruft jede `admin_*`-Funktion und beide internen Funktionen auf; Besucher ohne Login | B: `42501`; Besucher: `42501`; A: erlaubt; nach Entzug sofort `42501` | T1–T9d, T60–T64/T81–T88 |
| 11 | Entwurf über normale Schüler-Oberfläche | B und A lesen `public.events` direkt; App-Liste | Entwurf unsichtbar (auch für Admin in der normalen Liste) | T13, T22 |
| 12 | Abgelehnte Idee über normale Oberfläche | B/A lesen `public.ideas`; `get_idea_support_counts()` | für andere unsichtbar, keine Zahl; Autor:in sieht eigene | T66, T72–T74 |
| 13 | Falsche Isolationsstufe | `begin isolation level repeatable read;` dann Anmeldung / Admin-Änderung | `DC009` | K5 |
| 14 | Ideen-Übergänge | rejected → collecting / review / planned | `DC004`; nur rejected → submitted erlaubt | T68–T68c, T78 |

**Erfolgskriterium:** Stufe 1 entspricht den Erwartungen, Stufe 2 meldet nur `OK`, alle Szenarien
aus Stufe 3 liefern genau die erwarteten Fehler bzw. Erfolge. Erst dann 006 in der Live-Datenbank ausführen.
