/**
 * Teilnehmende Schulen.
 *
 * partnershipStatus beschreibt den TATSÄCHLICHEN Stand (siehe README, Abschnitt 5):
 * - 'initiator' – Schule, an der DeutschConnect entstanden ist
 * - 'interest'  – Interesse an Zusammenarbeit bekundet, Details noch in Abstimmung
 * - 'confirmed' – formell bestätigte Kooperation (aktuell: keine)
 *
 * Neue Schule: einfach einen weiteren Eintrag ergänzen.
 */
export const schools = [
  {
    id: 'ers',
    name: 'Ernst-Reuter-Schule Ankara',
    shortName: 'ERS',
    city: 'Ankara',
    partnershipStatus: 'initiator',
    color: '#2f6fd6',
    description: {
      de: 'Ausgangsschule von Connect/ED. Hier hat eine Schülergruppe die Idee für die Plattform entwickelt und arbeitet an ihrer Umsetzung.',
      tr: "Connect/ED'nin çıkış noktası. Bu okuldaki bir öğrenci grubu platform fikrini geliştirdi ve hayata geçirmek için çalışıyor.",
      en: 'Starting point of Connect/ED. A group of students here developed the idea for the platform and is building it.',
    },
  },
  {
    id: 'anka',
    name: 'Anka Bilim',
    shortName: 'Anka Bilim',
    city: 'Ankara',
    partnershipStatus: 'interest',
    color: '#7c5cd6',
    description: {
      de: 'Erste vorgesehene Partnerschule. Anka Bilim hat Interesse an einer Zusammenarbeit bekundet; Form und Termine werden noch abgestimmt.',
      tr: 'Öngörülen ilk ortak okul. Anka Bilim iş birliğine ilgi gösterdi; iş birliğinin biçimi ve tarihleri henüz netleştiriliyor.',
      en: 'First intended partner school. Anka Bilim has expressed interest in working together; format and dates are still being agreed.',
    },
  },
];

/**
 * Schulen, die auf der Website NICHT angezeigt werden (Entscheidung Ege, 2026-11-10: Anka Bilim ausblenden).
 * Nur Anzeige: Einträge oben, Datenbank-Zeilen und Verknüpfungen bleiben unverändert erhalten.
 * Wieder einblenden: ID aus dieser Liste entfernen.
 */
export const HIDDEN_SCHOOL_IDS = ['anka'];

export const isHiddenSchool = (id) => HIDDEN_SCHOOL_IDS.includes(id);

/** Schulen für Auswahllisten, Filter und Übersichten (ohne ausgeblendete). */
export const visibleSchools = schools.filter((school) => !isHiddenSchool(school.id));

/** Nur die sichtbaren Schul-IDs einer Liste (Reihenfolge bleibt). */
export const visibleSchoolIds = (ids) => (Array.isArray(ids) ? ids.filter((id) => !isHiddenSchool(id)) : []);

/** Schule für die ANZEIGE – ausgeblendete Schulen liefern undefined (wie eine unbekannte Schule). */
export function getSchool(id) {
  if (isHiddenSchool(id)) return undefined;
  return schools.find((school) => school.id === id);
}

/** Interner Zugriff inkl. ausgeblendeter Schulen (z. B. Namen, um Inhalte zu erkennen) – nicht anzeigen. */
export function getSchoolRecord(id) {
  return schools.find((school) => school.id === id);
}
