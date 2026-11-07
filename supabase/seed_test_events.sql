-- OPTIONAL: zwei fiktive TEST-Events, damit ihr Anmeldungen mit echten Konten
-- ausprobieren könnt. Erst NACH 001_initial_schema.sql im SQL Editor ausführen.
-- Löschen, sobald echte Events eingetragen sind:
--   delete from public.events where title ->> 'de' like '[Test]%';

insert into public.events
  (title, summary, location, audience, start_at, duration_minutes, capacity,
   topics, format, host_school_id, school_ids, status)
values
  (
    '{"de": "[Test] Sprachcafé", "tr": "[Test] Dil Kafesi", "en": "[Test] Language Café"}',
    '{"de": "Test-Event zum Ausprobieren der Anmeldung.", "tr": "Kayıt özelliğini denemek için test etkinliği.", "en": "Test event for trying out sign-ups."}',
    '{"de": "ERS, Bibliothek", "tr": "ERS, Kütüphane", "en": "ERS, library"}',
    '{"de": "Klassen 9–12", "tr": "9–12. sınıflar", "en": "Grades 9–12"}',
    now() + interval '7 days', 90, 30,
    '{languages,culture}', 'meetup', 'ers', '{ers,anka}', 'planned'
  ),
  (
    '{"de": "[Test] Robotik-Workshop", "tr": "[Test] Robotik Atölyesi", "en": "[Test] Robotics Workshop"}',
    '{"de": "Test-Event zum Ausprobieren der Anmeldung.", "tr": "Kayıt özelliğini denemek için test etkinliği.", "en": "Test event for trying out sign-ups."}',
    '{"de": "Anka Bilim, Labor", "tr": "Anka Bilim, Laboratuvar", "en": "Anka Bilim, lab"}',
    '{"de": "Klassen 9–11", "tr": "9–11. sınıflar", "en": "Grades 9–11"}',
    now() + interval '14 days', 120, 16,
    '{technology,science}', 'workshop', 'anka', '{ers,anka}', 'confirmed'
  );
