# Ablauf von Events – automatisches Löschen (Stand 2026-11-10)

**Kurzfassung:** Events werden automatisch **gelöscht** – Migration **018** (Regeln + Löschfunktion) und **019**
(Zeitplan, jede Minute). **Status: nur im Repository, lokal getestet. Weder Staging noch Live ausgeführt.**
Das frühere Archivieren (008/009) bleibt in der Datenbank, wird aber nie mehr wirksam: Löschen ist immer zuerst fällig.

## 1. Die zwei Regeln

| Event | gelöscht ab | egal ist |
|---|---|---|
| **abgesagt** (`cancelled`) | `cancelled_at` + 24 h (Zeitpunkt der Absage, gesetzt von `admin_set_event_status`) | ursprünglicher Termin |
| **nicht abgesagt** (`planned`, `confirmed`, `completed`) | `start_at` + 24 h | Dauer, Ende, ob noch „geplant“ markiert |
| Entwurf (`draft`) | nie automatisch | – |

Beispiele: abgesagt Mo 16:00 → gelöscht Di 16:00 · geplant für Mo 16:00 → gelöscht Di 16:00.

- **Zeitzonen:** `start_at`, `cancelled_at` und `now()` sind `timestamptz` (absolute Zeitpunkte). Die Zeitzone der
  Sitzung/des Browsers spielt keine Rolle. `+ interval '24 hours'` ist immer genau 24 h (nicht `'1 day'`).
- **Nie zu früh:** gelöscht wird nur bei `fällig <= now()`. **Spätestens ~1 Minute danach** (pg_cron jede Minute).
  Die App blendet das Event schon sekundengenau aus (`src/lib/eventArchive.js` → `eventDeletionDueAt`, `visibleToStudents`).
- **Hintergrund:** pg_cron läuft in der Datenbank – unabhängig davon, ob jemand die Website besucht. Kein Server,
  keine Edge Function, kein Service-Role-Key.
- **Verschieben:** ändert ein Admin das Datum eines geplanten Events, zählt das neue `start_at`.
  Das Datum abgesagter Events ist fest (DC006).

## 2. Wo die Regel steckt

| Ort | Aufgabe |
|---|---|
| `018` → `event_deletion_due_at(status, start_at, cancelled_at)` | Fälligkeit (eine Stelle für die Regel) |
| `018` → `delete_expired_events()` | löscht fällige Events; nur Datenbank-Eigentümer (auch nicht `service_role`) |
| `018` → Tabelle `event_deletion_log` | was wann gelöscht wurde – ohne Personendaten, nur im SQL Editor lesbar |
| `019` → pg_cron-Job `dc_delete_expired_events` (`* * * * *`) | Zeitplan; entfernt den alten Job `dc_archive_finished_events` (009) |
| `014` → `chat_detach_event_room(event)` | sichert die Eventgruppe vor dem Löschen |
| `src/lib/eventArchive.js` | gleiche Regel im Frontend (pünktliches Ausblenden) |

## 3. Verknüpfte Daten

| Daten | beim automatischen Löschen |
|---|---|
| **Anmeldungen** (`event_registrations`) | werden **mitgelöscht** (`on delete cascade`, 001). Die Anzahl (angemeldet/interessiert) steht im Lösch-Protokoll. |
| **Eventgruppe im Chat + Nachrichten** | **bleiben erhalten.** Vorher: verbindlich Angemeldete werden als Mitglieder gesichert (lesen weiter), Titel wird kopiert (`event_title`), Gruppe archiviert (nur lesen), `event_id = null`. Wieder öffnen nicht möglich (DC051). Eintrag im Chat-Audit-Protokoll. |
| Meldungen / Beweis-Kopien | unberührt |
| Manuelles `DELETE` eines Events mit Gruppe | weiterhin blockiert (`ON DELETE RESTRICT`) |
| Fehler bei einem Event | nur dieses bleibt (WARNING), die anderen werden gelöscht; nächster Lauf versucht es erneut |

**Folgen, die bewusst entschieden werden sollten (nicht umgesetzt):**
- Profil-Statistik „teilgenommene Events“ (012) und „Anmeldungen gesamt“ in der Admin-Übersicht (010) zählen über
  `event_registrations` – sie **sinken**, sobald Events gelöscht werden. Wenn die Teilnahme-Historie bleiben soll,
  bräuchte es eine eigene (datensparsame) Historie.
- „Archivierte Events“ in der Admin-Übersicht bleibt künftig 0.
- Interessierte (nicht verbindlich Angemeldete) behalten keinen Zugriff auf die Eventgruppe – wie vorher auch.

## 4. Reihenfolge beim Ausführen (später, nach Freigabe)

008 → 014 (falls Chat) → **018** → **019**. 009 ist nicht mehr nötig. 018 bricht ab, wenn eine ältere 014-Fassung
ohne `chat_detach_event_room` installiert ist. 018 funktioniert auch ohne Chat (014 kann später folgen).

## 5. Tests (lokal, Wegwerf-PostgreSQL 18 mit Supabase-Nachbildung)

- `supabase/tests/018_event_auto_delete_test.sql`: **29 × OK** (Grenzen ±1 s für beide Regeln, Admin-Absage,
  5 Sitzungs-Zeitzonen, Sommerzeitwechsel, Entwurf, Anmeldungen, Chat G1–G5, Fehler-Isolation, Idempotenz, Rechte).
  Ohne 014: 24 × OK + INFO (Chat übersprungen).
- Echtzeit-Lauf über getrennte Transaktionen mit echtem Warten: vor Ablauf 0 gelöscht, nach Ablauf beide (≈1 s
  nach Fälligkeit – Wartezeit des Tests).
- 019 gegen eine pg_cron-Nachbildung (lokal gibt es kein pg_cron): zweimal ausführbar, genau ein Job, alter Job weg.
  **Der echte pg_cron-Lauf ist nur auf Staging prüfbar.**
- Bestehend weiterhin grün: `014_chat_test.sql` 141 × OK, `event_archiving_test.sql` 25 × OK,
  `008_event_expiry_rules_test.sql` 19 × OK.
- `npm test`: `tests/eventAutoDelete.test.js` (13 Tests) grün.
