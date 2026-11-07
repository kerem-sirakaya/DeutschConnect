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
      de: 'Ausgangsschule von DeutschConnect. Hier hat eine Schülergruppe die Idee für die Plattform entwickelt und arbeitet an ihrer Umsetzung.',
      tr: "DeutschConnect'in çıkış noktası. Bu okuldaki bir öğrenci grubu platform fikrini geliştirdi ve hayata geçirmek için çalışıyor.",
      en: 'Starting point of DeutschConnect. A group of students here developed the idea for the platform and is building it.',
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

export function getSchool(id) {
  return schools.find((school) => school.id === id);
}
