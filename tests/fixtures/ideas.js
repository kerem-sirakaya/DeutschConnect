// TESTDATEN (fiktiv) – nur für automatische Tests. Die App verwendet diese Datei NICHT (früherer Demo-Modus).
import { relativeDate } from '../../src/lib/dates.js';

/**
 * BEISPIEL-IDEEN (Demo-Daten).
 *
 * Datenschutz: Ideen anderer Schüler:innen zeigen keinen Namen, nur die Schule.
 * authorId verweist nur bei Demo-Profilen auf ein Profil (für "Meine Ideen").
 *
 * status: 'submitted' | 'collecting' | 'review' | 'planned'
 * Unterstützungen werden NICHT hier gespeichert, sondern pro Profil im Demo-Zustand
 * (src/state/AppStateContext.jsx) – so gibt es keine erfundenen Zahlen.
 */
const seeds = [
  {
    id: 'i1',
    daysAgo: 12,
    authorId: 'alex',
    schoolId: 'ers',
    title: {
      de: 'Sprach-Tandem ERS × Anka Bilim',
      tr: 'Dil Tandemi ERS × Anka Bilim',
      en: 'Language Tandem ERS × Anka Bilim',
    },
    summary: {
      de: 'Feste Tandem-Paare treffen sich alle zwei Wochen und üben Deutsch und Türkisch.',
      tr: 'Sabit tandem çiftleri iki haftada bir buluşup Almanca ve Türkçe pratik yapar.',
      en: 'Fixed tandem pairs meet every two weeks to practise German and Turkish.',
    },
    description: {
      de: 'Jede Person bringt ihre stärkere Sprache ein und lernt die andere. Die Treffen könnten abwechselnd an beiden Schulen oder online stattfinden. Lehrkräfte helfen bei der Bildung der Paare.',
      tr: 'Herkes güçlü olduğu dili katkı olarak getirir ve diğerini öğrenir. Buluşmalar dönüşümlü olarak iki okulda ya da çevrim içi yapılabilir. Çiftlerin oluşturulmasında öğretmenler yardımcı olur.',
      en: 'Everyone contributes their stronger language and learns the other. Meetings could alternate between both schools or happen online. Teachers help form the pairs.',
    },
    topics: ['languages', 'culture'],
    format: 'meetup',
    schoolIds: ['ers', 'anka'],
    status: 'collecting',
  },
  {
    id: 'i2',
    daysAgo: 20,
    authorId: 'elif',
    schoolId: 'anka',
    title: {
      de: 'Gemeinsames Wandbild für beide Schulen',
      tr: 'İki Okul İçin Ortak Duvar Resmi',
      en: 'Shared Mural for Both Schools',
    },
    summary: {
      de: 'Ein Motiv gemeinsam entwerfen und in beiden Schulen je eine Hälfte malen.',
      tr: 'Bir motifi birlikte tasarlayıp her okulda bir yarısını boyamak.',
      en: 'Design a motif together and paint one half at each school.',
    },
    description: {
      de: 'Die beiden Hälften ergeben zusammen ein Bild – als Symbol für die Zusammenarbeit. Benötigt werden eine Genehmigung der Schulen und Material.',
      tr: 'İki yarı birlikte tek bir resim oluşturur – iş birliğinin sembolü olarak. Okulların izni ve malzeme gerekiyor.',
      en: 'Together the two halves form one picture – a symbol of the collaboration. Requires school approval and materials.',
    },
    topics: ['arts', 'culture'],
    format: 'project',
    schoolIds: ['anka', 'ers'],
    status: 'review',
  },
  {
    id: 'i3',
    daysAgo: 6,
    authorId: null,
    schoolId: 'anka',
    title: {
      de: 'Podcast: Leben zwischen Sprachen',
      tr: 'Podcast: Diller Arasında Yaşam',
      en: 'Podcast: Life Between Languages',
    },
    summary: {
      de: 'Schüler:innen beider Schulen sprechen über ihre Erfahrungen mit mehreren Sprachen.',
      tr: 'İki okuldan öğrenciler birden fazla dille ilgili deneyimlerini anlatıyor.',
      en: 'Students from both schools talk about their experiences with multiple languages.',
    },
    description: {
      de: 'Kurze Folgen mit Interviews. Veröffentlicht wird erst, wenn alle Beteiligten und die Schulen zugestimmt haben.',
      tr: 'Röportajlardan oluşan kısa bölümler. Yayın ancak tüm katılımcılar ve okullar onay verdikten sonra yapılır.',
      en: 'Short episodes with interviews. Nothing is published until everyone involved and the schools have agreed.',
    },
    topics: ['languages', 'culture', 'arts'],
    format: 'project',
    schoolIds: ['anka', 'ers'],
    status: 'collecting',
  },
  {
    id: 'i4',
    daysAgo: 3,
    authorId: 'alex',
    schoolId: 'ers',
    title: {
      de: 'Coding-Club über Schulgrenzen',
      tr: 'Okullar Arası Kodlama Kulübü',
      en: 'Cross-School Coding Club',
    },
    summary: {
      de: 'Wöchentliche Online-Treffen, um gemeinsam kleine Apps und Spiele zu programmieren.',
      tr: 'Birlikte küçük uygulamalar ve oyunlar programlamak için haftalık çevrim içi buluşmalar.',
      en: 'Weekly online meetings to build small apps and games together.',
    },
    description: {
      de: 'Erfahrene und neue Programmierer:innen arbeiten in gemischten Teams. Am Ende des Halbjahres zeigen die Teams ihre Projekte.',
      tr: 'Deneyimli ve yeni programcılar karma takımlarda çalışır. Dönem sonunda takımlar projelerini sunar.',
      en: 'Experienced and new programmers work in mixed teams. At the end of the term the teams present their projects.',
    },
    topics: ['technology', 'science'],
    format: 'online',
    schoolIds: ['ers', 'anka'],
    status: 'collecting',
  },
  {
    id: 'i5',
    daysAgo: 9,
    authorId: null,
    schoolId: 'ers',
    title: {
      de: 'Mathe-Lerngruppe vor Prüfungen',
      tr: 'Sınav Öncesi Matematik Çalışma Grubu',
      en: 'Maths Study Group Before Exams',
    },
    summary: {
      de: 'Schüler:innen erklären sich gegenseitig schwierige Themen – schulübergreifend.',
      tr: 'Öğrenciler zor konuları okullar arası birbirlerine anlatıyor.',
      en: 'Students explain difficult topics to each other – across schools.',
    },
    description: {
      de: 'Vor Klausuren trifft sich eine Lerngruppe online oder in der Bibliothek. Jede Person bereitet ein Thema vor, das sie gut kann.',
      tr: 'Sınavlardan önce bir çalışma grubu çevrim içi ya da kütüphanede buluşur. Herkes iyi bildiği bir konuyu hazırlar.',
      en: 'Before exams a study group meets online or in the library. Everyone prepares a topic they know well.',
    },
    topics: ['science'],
    format: 'workshop',
    schoolIds: ['ers', 'anka'],
    status: 'collecting',
  },
  {
    id: 'i6',
    daysAgo: 15,
    authorId: null,
    schoolId: 'ers',
    title: {
      de: 'Kulturabend mit Gerichten aus verschiedenen Regionen',
      tr: 'Farklı Bölgelerden Yemeklerle Kültür Akşamı',
      en: 'Culture Evening with Dishes from Different Regions',
    },
    summary: {
      de: 'Jede Gruppe stellt ein Gericht und eine kurze Geschichte dazu vor.',
      tr: 'Her grup bir yemek ve onunla ilgili kısa bir hikâye sunar.',
      en: 'Each group presents a dish and a short story about it.',
    },
    description: {
      de: 'Gemischte Gruppen aus beiden Schulen bereiten Gerichte und kurze Präsentationen auf Deutsch, Türkisch oder Englisch vor.',
      tr: 'İki okuldan karma gruplar yemekler ve Almanca, Türkçe ya da İngilizce kısa sunumlar hazırlar.',
      en: 'Mixed groups from both schools prepare dishes and short presentations in German, Turkish or English.',
    },
    topics: ['culture', 'social'],
    format: 'meetup',
    schoolIds: ['ers', 'anka'],
    status: 'collecting',
  },
];

export const seedIdeas = seeds.map(({ daysAgo, ...idea }) => ({
  ...idea,
  createdAt: relativeDate(-daysAgo, '12:00'),
  isDemo: true,
}));
