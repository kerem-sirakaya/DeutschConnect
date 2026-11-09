# DeutschConnect – Integrationsfortschritt

Plan: [FINAL_INTEGRATION_PLAN.md](FINAL_INTEGRATION_PLAN.md) · Branch `integration-v1` · **nichts committet, nichts gepusht,
keine Migration ausgeführt, nichts veröffentlicht.**

Legende: ✔ erledigt und lokal geprüft · ◐ Code fertig, Live-Abnahme offen · ○ offen

| Stufe | Inhalt | Stand |
|---|---|---|
| 1 | Claude-Backend + Auth als Basis | ✔ unverändert (AuthContext, AppStateContext, Admin, Migrationen 001–010) |
| 2 | Codex-Design + Hauptnavigation | ✔ |
| 3 | Codex-Startseite/Dashboard | ✔ |
| 4 | Nachhilfe-Börse | ◐ Migration 011 nicht ausgeführt → im Konto-Modus noch nicht nutzbar |
| 5 | Profile + Statistiken | ○ |
| 6 | Projekte (Anträge/Mitglieder), Events-Optik, Gruppen | ○ |
| 7 | Admin für neue Module, 24-h-Ausblendung abgelehnter Ideen | ○ |
| 8 | Spiele + Bestenlisten | ○ |
| 9 | Inkonsistenzen beheben | ○ |
| 10 | Mehrbenutzer-Gesamttest | ○ |

---

## Sitzung 2026-11-09 – Stufen 1–4

### Geändert / neu

| Datei | Änderung |
|---|---|
| `src/styles/variables.css` | Farb-/Radius-/Schrift-Werte aus Codex `global.css`, Variablennamen unverändert |
| `src/styles/base.css` | Überschriften-Typografie wie Codex (h1 clamp 1.65–2.25 rem) |
| `src/styles/layout.css` | Codex-Kopfleiste, schwebende Bottom-Nav, Desktop-Navigation ab 1050 px, Fußzeile; Seitenleiste entfernt |
| `src/styles/modules.css` (neu) | Codex-Muster: Begrüßungskarte, task-card, Hub-Karten, Unter-Navigation, Nachhilfe |
| `src/components/layout/navigation.js` | 5 Codex-Bereiche + `sectionForPath()` |
| `src/components/layout/MainNav.jsx` (neu), `BottomNav.jsx`, `TopBar.jsx`, `AppShell.jsx` | eine Navigation für unten/oben; Admin + Konto über Profilmenü; „Über“ in Fußzeile |
| `src/components/layout/SideNav.jsx` | **gelöscht** (ersetzt durch Kopfleisten-Navigation) |
| `src/components/SectionNav.jsx` (neu) | Unter-Navigation „Entdecken“ (Übersicht/Events/Ideen/Netzwerk) |
| `src/pages/DiscoverPage.jsx`, `CommunityPage.jsx` (neu) | Bereichsseiten; Community zeigt nicht fertige Module ehrlich als „In Integration“ ohne Knöpfe |
| `src/pages/EventsPage.jsx`, `IdeasPage.jsx`, `NetworkPage.jsx` | nur `SectionNav` ergänzt |
| `src/pages/HomePage.jsx`, `src/components/QuickActions.jsx` | Codex-Begrüßungskarte, Nachhilfe-Vorschläge, Schnellzugriff auf neue Bereiche |
| `supabase/migrations/011_tutoring.sql` (neu) | Nachhilfe-Backend (siehe unten) |
| `src/lib/tutoring.js`, `src/lib/tutoringApi.js`, `src/data/tutoring.js`, `src/state/TutoringContext.jsx` (neu) | Regeln, Supabase-Zugriff, Demo-Daten, Zustand |
| `src/components/tutoring/*`, `src/pages/Tutoring*Page.jsx` (neu) | Liste mit Tabs/Filtern, Formular, Detail mit Anfragen |
| `src/App.jsx`, `src/main.jsx` | Routen `/discover`, `/tutoring…`, `/community`; `TutoringProvider` |
| `src/lib/format.js` | `formatDateShort()` |
| `src/locales/{de,tr,en}.json` | alle neuen Texte in drei Sprachen (Nachhilfe-Texte aus Codex übernommen) |
| `tests/navigation.test.js`, `tests/tutoring.test.js` (neu) | 26 neue Tests |

### Nachhilfe – was wie funktioniert

| Funktion | Umsetzung | Echt / Demo |
|---|---|---|
| Angebot/Gesuch erstellen, bearbeiten | `insert/update tutoring_entries` (RLS: nur eigene, eigene Schule) | echt (nach 011) |
| Schließen/Wiederöffnen, Löschen | `update status` / `delete` (RLS) | echt (nach 011) |
| Suchen, Filtern (Fach, Sprache, Format) | `filterTutoringEntries` (Fächer sprachübergreifend vereinheitlicht) | lokal über geladene Daten |
| Passende Partner finden | `matchTutoring` (gegenteilige Art, gleiches Fach, gemeinsame Sprache) auf der Startseite | lokal über geladene Daten |
| Interesse/Merken | `tutoring_saves` (nur für einen selbst) | echt (nach 011) |
| Anfrage senden | RPC `tutoring_send_request` – geht wirklich an die erstellende Person | echt (nach 011) |
| Anfragen empfangen | Tab „Anfragen“ + Detailseite + Zähler auf Startseite; Neuladen beim Öffnen und bei Fensterwechsel | echt, **kein Push/Realtime** |
| Annehmen/Ablehnen mit Notiz, Zurückziehen | RPCs `tutoring_respond_request`, `tutoring_withdraw_request` (Statusregeln in der DB) | echt (nach 011) |
| Profil der Person öffnen | **noch nicht** – kommt mit Stufe 5 (freiwillige Profile) | offen |
| Abgemeldet | 4 fiktive Einträge, nur lesen, deutlich als Demo markiert | Demo |

Datenschutz: Listen zeigen Schule, keinen Namen. Absender:in gibt mit der Anfrage den eigenen Vornamen frei; den
Vornamen der erstellenden Person sieht man erst nach Annahme. E-Mail/Link/Telefonnummer werden in Frontend **und**
Datenbank abgelehnt (`dc_has_contact_data`). Keine Chats – nur Nachricht + kurze Antwortnotiz.

Ersetzt den Codex-„Kontaktentwurf“, der nur im Browser gespeichert und nie zugestellt wurde.

### Durchgeführte Prüfungen

| Prüfung | Ergebnis |
|---|---|
| `npm test` | **293/293 grün** (vorher 267; +26 neue, keine bestehenden geändert) |
| `npm run build` | erfolgreich; bekannte Warnung Chunk > 500 kB (vorher ~692 kB, jetzt ~764 kB) |
| i18n-Test | alle Schlüssel in DE/TR/EN vorhanden, keine leeren Texte |
| Render-Smoke-Test (Vite-SSR, Demo-Modus, Skript im Scratchpad, nicht im Repo) | 18 Routen fehlerfrei gerendert: `/`, `/discover`, `/events`, `/ideas`, `/network`, `/community`, `/tutoring` (+Tabs), Detail, Neu, Bearbeiten, unbekannte ID → „nicht gefunden“, `/me`, `/about`, `/admin` (→ Login) |

**Nicht geprüft:** Browser-Bedienung (Klicks, Layout auf echtem Handy), Konto-Modus, Migration 011 gegen eine
Datenbank (kein lokales PostgreSQL vorhanden – SQL ist nur gelesen, nicht ausgeführt), Zwei-Konten-Ablauf.

### Bekannte Grenzen / offene Punkte

1. **011 ausführen** (nach Freigabe, erst Staging): Danach Zwei-Konten-Test: A erstellt Angebot → B findet, merkt, fragt
   an → A sieht Anfrage, nimmt an → beide laden neu und sehen „Angenommen“; Negativtest: B kann A's Eintrag nicht ändern.
2. Keine Admin-Moderation für Nachhilfe (Stufe 7).
3. Anfrage-Zustellung ohne Push/E-Mail – sichtbar beim nächsten Laden.
4. Löschen eines Eintrags löscht auch dessen Anfragen (cascade) – bewusst einfach; ggf. später „nur schließen“.
5. Codex-„Initiativen“ (statische Team-Vorschläge mit lokalem Interesse) nicht übernommen, weil sie keine echte
   Funktion hatten.
6. Bundle wächst; Code-Splitting der Seiten (wie beim Admin-Bereich) später sinnvoll.

### Nächste Schritte

1. Ege bestätigt Live-Stand 007–010 und gibt 011 für Staging frei → Zwei-Konten-Test Nachhilfe.
2. Stufe 5: Migration 012 (freiwillige Profilfreigaben + Statistik-RPCs), Seite `/community/people/:id`,
   Statistiken in „Mein Bereich“; Profil-Link in Nachhilfe-Anfragen.
3. Danach Stufe 6–8 gemäß Plan.
