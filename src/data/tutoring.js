/**
 * DEMO-Nachhilfeeinträge – fiktiv, keine echten Personen (Idee aus der Codex-Version).
 * Werden NUR abgemeldet (Demo-Modus) angezeigt. Im Demo-Modus kann man nichts senden
 * oder speichern; dafür braucht es ein echtes Konto (Supabase, Migration 011).
 *
 * ownerId verweist auf die Demo-Profile in src/data/profiles.js.
 */
export const demoTutoringEntries = [
  {
    id: 'demo-math-offer',
    ownerId: 'alex',
    schoolId: 'ers',
    kind: 'offer',
    subject: { de: 'Mathematik', tr: 'Matematik', en: 'Mathematics' },
    topics: { de: 'Bruchrechnung, lineare Gleichungen', tr: 'Kesirler, doğrusal denklemler', en: 'Fractions, linear equations' },
    description: {
      de: 'Ich erkläre Schritt für Schritt mit Beispielaufgaben aus dem Unterricht der Klassen 7 und 8.',
      tr: '7. ve 8. sınıf derslerinden örnek sorularla adım adım anlatırım.',
      en: 'I explain step by step using example exercises from grade 7 and 8 lessons.',
    },
    availability: { de: 'Dienstags nach der 8. Stunde', tr: 'Salı günleri 8. dersten sonra', en: 'Tuesdays after 8th period' },
    languages: ['de', 'tr'],
    format: 'online',
    status: 'active',
  },
  {
    id: 'demo-german-offer',
    ownerId: 'elif',
    schoolId: 'anka',
    kind: 'offer',
    subject: { de: 'Deutsch', tr: 'Almanca', en: 'German' },
    topics: { de: 'Gesprächsübungen A2–B1', tr: 'Konuşma alıştırmaları A2–B1', en: 'Conversation practice A2–B1' },
    description: {
      de: 'Wir üben Alltagsgespräche und kurze Präsentationen – entspannt und ohne Notendruck.',
      tr: 'Günlük konuşmaları ve kısa sunumları rahat bir ortamda, not baskısı olmadan çalışırız.',
      en: 'We practise everyday conversations and short presentations – relaxed and without grade pressure.',
    },
    availability: { de: 'Mittwochs in der Mittagspause', tr: 'Çarşamba öğle arasında', en: 'Wednesdays during lunch break' },
    languages: ['tr', 'de'],
    format: 'school',
    status: 'active',
  },
  {
    id: 'demo-math-request',
    ownerId: 'deniz',
    schoolId: 'anka',
    kind: 'request',
    subject: { de: 'Mathematik', tr: 'Matematik', en: 'Mathematics' },
    topics: { de: 'Funktionen und Graphen', tr: 'Fonksiyonlar ve grafikler', en: 'Functions and graphs' },
    description: {
      de: 'Ich suche jemanden, der mir lineare und quadratische Funktionen noch einmal erklärt.',
      tr: 'Doğrusal ve ikinci dereceden fonksiyonları bana tekrar anlatacak birini arıyorum.',
      en: 'I am looking for someone to explain linear and quadratic functions to me again.',
    },
    availability: { de: 'Nach Absprache, am liebsten freitags', tr: 'Anlaşmaya göre, tercihen cuma', en: 'By arrangement, preferably Fridays' },
    languages: ['tr', 'de'],
    format: 'either',
    status: 'active',
  },
  {
    id: 'demo-coding-request',
    ownerId: 'alex',
    schoolId: 'ers',
    kind: 'request',
    subject: { de: 'Informatik', tr: 'Bilişim', en: 'Computer science' },
    topics: { de: 'Erste Schritte mit Python', tr: 'Python ile ilk adımlar', en: 'First steps with Python' },
    description: {
      de: 'Für ein Schulprojekt möchte ich Schleifen und Listen in Python besser verstehen.',
      tr: 'Bir okul projesi için Python’daki döngüleri ve listeleri daha iyi anlamak istiyorum.',
      en: 'For a school project I would like to understand loops and lists in Python better.',
    },
    availability: { de: 'Wochenende, online', tr: 'Hafta sonu, çevrim içi', en: 'Weekends, online' },
    languages: ['de', 'en'],
    format: 'online',
    status: 'active',
  },
];

/** Demo-Einträge in die gleiche Form wie echte Einträge bringen (isOwn hängt vom Demo-Profil ab). */
export function demoTutoringFor(profileId) {
  return demoTutoringEntries.map((entry) => ({
    ...entry,
    isOwn: entry.ownerId === profileId,
    isSaved: false,
    myRequestStatus: null,
    incomingPending: 0,
    isDemo: true,
  }));
}
