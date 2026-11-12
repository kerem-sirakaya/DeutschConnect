// TESTDATEN (fiktiv) – nur für automatische Tests. Die App verwendet diese Datei NICHT (früherer Demo-Modus).
/**
 * Gemeinsame Projekte.
 * p1 beschreibt das echte DeutschConnect-Projekt; die Mitgliedschaft dort ist aber
 * nur dem Demo-Profil zugeordnet. p2 und p3 sind Beispielprojekte (isDemo: true).
 *
 * status: 'active' | 'planning'
 */
export const projects = [
  {
    id: 'p1',
    isDemo: false,
    title: { de: 'Connect/ED-Plattform', tr: 'Connect/ED Platformu', en: 'Connect/ED Platform' },
    summary: {
      de: 'Ein Schülerteam entwickelt diese Plattform für schulübergreifende Zusammenarbeit.',
      tr: 'Bir öğrenci ekibi, okullar arası iş birliği için bu platformu geliştiriyor.',
      en: 'A student team is building this platform for cross-school collaboration.',
    },
    description: {
      de: 'Das Projekt ist an der ERS entstanden. Aktuell gibt es einen Prototyp mit Beispieldaten; als Nächstes soll die Plattform mit einer kleinen Testgruppe erprobt werden.',
      tr: "Proje ERS'te doğdu. Şu anda örnek verilerle çalışan bir prototip var; bir sonraki adımda platform küçük bir test grubuyla denenecek.",
      en: 'The project started at ERS. Currently there is a prototype with sample data; next, the platform will be tested with a small group.',
    },
    nextStep: {
      de: 'Pilot mit einer kleinen Testgruppe vorbereiten',
      tr: 'Küçük bir test grubuyla pilot uygulamayı hazırlamak',
      en: 'Prepare a pilot with a small test group',
    },
    topics: ['technology', 'social'],
    schoolIds: ['ers'],
    memberIds: ['alex'],
    status: 'active',
  },
  {
    id: 'p2',
    isDemo: true,
    title: {
      de: 'Schülerzeitung über Schulgrenzen',
      tr: 'Okullar Arası Öğrenci Gazetesi',
      en: 'Cross-School Student Newspaper',
    },
    summary: {
      de: 'Eine gemeinsame Online-Ausgabe mit Beiträgen aus beiden Schulen.',
      tr: 'İki okulun yazılarından oluşan ortak bir çevrim içi sayı.',
      en: 'A shared online issue with contributions from both schools.',
    },
    description: {
      de: 'Artikel, Interviews und Fotos entstehen in gemischten Teams. Vor jeder Veröffentlichung prüfen die Schulen die Inhalte.',
      tr: 'Makaleler, röportajlar ve fotoğraflar karma takımlarda hazırlanır. Her yayından önce okullar içerikleri kontrol eder.',
      en: 'Articles, interviews and photos are created in mixed teams. The schools review all content before publication.',
    },
    nextStep: {
      de: 'Redaktionsteam aus beiden Schulen bilden',
      tr: 'İki okuldan bir yayın ekibi oluşturmak',
      en: 'Form an editorial team from both schools',
    },
    topics: ['arts', 'languages', 'culture'],
    schoolIds: ['ers', 'anka'],
    memberIds: ['elif'],
    status: 'planning',
  },
  {
    id: 'p3',
    isDemo: true,
    title: { de: 'Schulgarten-Projekt', tr: 'Okul Bahçesi Projesi', en: 'School Garden Project' },
    summary: {
      de: 'Gemeinsam Hochbeete anlegen und das Pflanzenwachstum dokumentieren.',
      tr: 'Birlikte yükseltilmiş bahçe yatakları kurmak ve bitkilerin büyümesini belgelemek.',
      en: 'Build raised beds together and document how the plants grow.',
    },
    description: {
      de: 'Beide Schulen legen ein Beet an und vergleichen ihre Messwerte. Die Ergebnisse werden gemeinsam ausgewertet.',
      tr: 'İki okul da birer bahçe yatağı kurar ve ölçümlerini karşılaştırır. Sonuçlar birlikte değerlendirilir.',
      en: 'Both schools set up a bed and compare their measurements. The results are evaluated together.',
    },
    nextStep: {
      de: 'Standort und Genehmigung klären',
      tr: 'Yer ve izni netleştirmek',
      en: 'Clarify location and approval',
    },
    topics: ['science', 'social'],
    schoolIds: ['anka', 'ers'],
    memberIds: [],
    status: 'planning',
  },
];

export function getProject(id) {
  return projects.find((project) => project.id === id);
}
