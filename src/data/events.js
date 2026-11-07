import { relativeDate } from '../lib/dates.js';

/**
 * BEISPIEL-EVENTS (Demo-Daten, keine echten Veranstaltungen).
 *
 * Die Daten werden relativ zu "heute" berechnet, damit die Demo immer aktuell wirkt.
 * Echte Events würden später aus einer Datenbank kommen und ein festes ISO-Datum
 * im Feld `start` haben – der restliche Code funktioniert dann unverändert.
 *
 * status: 'planned' | 'confirmed' | 'completed' | 'cancelled'
 * organizerIds: IDs der Demo-Profile, die das Event (fiktiv) organisieren
 */
const seeds = [
  {
    id: 'e1',
    dayOffset: 5,
    time: '15:30',
    durationMinutes: 90,
    title: {
      de: 'Sprachcafé: Deutsch-Nachmittag',
      tr: 'Dil Kafesi: Almanca Öğleden Sonrası',
      en: 'Language Café: German Afternoon',
    },
    summary: {
      de: 'Locker Deutsch sprechen, Spiele spielen und Schüler:innen der anderen Schule kennenlernen.',
      tr: 'Rahat bir ortamda Almanca konuşmak, oyun oynamak ve diğer okulun öğrencileriyle tanışmak.',
      en: 'Speak German casually, play games and meet students from the other school.',
    },
    description: {
      de: 'Kleine gemischte Gruppen aus beiden Schulen unterhalten sich zu Alltagsthemen. Alle Sprachniveaus sind willkommen – Ziel ist Spaß am Sprechen, nicht Perfektion.',
      tr: 'İki okuldan karma küçük gruplar günlük konular hakkında sohbet eder. Her dil seviyesi davetlidir – amaç mükemmellik değil, konuşmanın keyfidir.',
      en: 'Small mixed groups from both schools chat about everyday topics. All language levels are welcome – the goal is enjoying speaking, not perfection.',
    },
    location: { de: 'ERS, Bibliothek', tr: 'ERS, Kütüphane', en: 'ERS, library' },
    audience: { de: 'Klassen 9–12', tr: '9–12. sınıflar', en: 'Grades 9–12' },
    capacity: 30,
    topics: ['languages', 'culture'],
    format: 'meetup',
    hostSchoolId: 'ers',
    schoolIds: ['ers', 'anka'],
    status: 'confirmed',
    organizerIds: [],
  },
  {
    id: 'e2',
    dayOffset: 9,
    time: '14:00',
    durationMinutes: 120,
    title: {
      de: 'Robotik-Workshop für Einsteiger',
      tr: 'Yeni Başlayanlar İçin Robotik Atölyesi',
      en: 'Robotics Workshop for Beginners',
    },
    summary: {
      de: 'In gemischten Teams einen kleinen Roboter bauen und programmieren.',
      tr: 'Karma takımlarda küçük bir robot yapıp programlamak.',
      en: 'Build and program a small robot in mixed teams.',
    },
    description: {
      de: 'Ihr arbeitet in Teams mit je zwei Personen pro Schule. Vorkenntnisse sind nicht nötig; Material wird gestellt.',
      tr: 'Her okuldan ikişer kişinin olduğu takımlarda çalışacaksınız. Ön bilgi gerekmez; malzemeler sağlanır.',
      en: 'You work in teams with two people from each school. No prior knowledge needed; materials are provided.',
    },
    location: { de: 'Anka Bilim, Technikraum', tr: 'Anka Bilim, teknoloji sınıfı', en: 'Anka Bilim, technology room' },
    audience: { de: 'Klassen 8–11', tr: '8–11. sınıflar', en: 'Grades 8–11' },
    capacity: 16,
    topics: ['technology', 'science'],
    format: 'workshop',
    hostSchoolId: 'anka',
    schoolIds: ['anka', 'ers'],
    status: 'planned',
    organizerIds: [],
  },
  {
    id: 'e3',
    dayOffset: 14,
    time: '15:00',
    durationMinutes: 90,
    title: {
      de: 'Debattierclub: Stadt der Zukunft',
      tr: 'Münazara Kulübü: Geleceğin Şehri',
      en: 'Debate Club: City of the Future',
    },
    summary: {
      de: 'Schulübergreifende Teams diskutieren auf Deutsch über nachhaltige Städte.',
      tr: 'Okullar arası takımlar sürdürülebilir şehirleri Almanca tartışıyor.',
      en: 'Cross-school teams debate sustainable cities in German.',
    },
    description: {
      de: 'Nach einer kurzen Einführung in Debattenregeln tretet ihr in gemischten Teams gegeneinander an. Am Ende gibt es Feedback statt Noten.',
      tr: 'Münazara kurallarına kısa bir girişten sonra karma takımlar halinde karşı karşıya geleceksiniz. Sonunda not yerine geri bildirim verilir.',
      en: 'After a short introduction to debate rules, mixed teams compete against each other. At the end there is feedback instead of grades.',
    },
    location: { de: 'ERS, Aula', tr: 'ERS, konferans salonu', en: 'ERS, assembly hall' },
    audience: { de: 'Klassen 10–12', tr: '10–12. sınıflar', en: 'Grades 10–12' },
    capacity: 24,
    topics: ['debate', 'languages', 'social'],
    format: 'discussion',
    hostSchoolId: 'ers',
    schoolIds: ['ers', 'anka'],
    status: 'planned',
    organizerIds: ['alex'],
  },
  {
    id: 'e4',
    dayOffset: 12,
    time: '13:00',
    durationMinutes: 180,
    title: {
      de: 'Fotoprojekt: Ankara im Herbst',
      tr: 'Fotoğraf Projesi: Sonbaharda Ankara',
      en: 'Photo Project: Ankara in Autumn',
    },
    summary: {
      de: 'Gemeinsamer Fotospaziergang mit anschließender Mini-Ausstellung.',
      tr: 'Ortak fotoğraf yürüyüşü ve ardından küçük bir sergi.',
      en: 'Joint photo walk followed by a mini exhibition.',
    },
    description: {
      de: 'Wir fotografieren in kleinen Gruppen einen Stadtteil und wählen danach gemeinsam Bilder für eine Ausstellung in beiden Schulen aus. Ein Smartphone reicht.',
      tr: 'Küçük gruplar halinde bir semti fotoğraflıyor, ardından iki okulda sergilenecek fotoğrafları birlikte seçiyoruz. Bir akıllı telefon yeterli.',
      en: 'In small groups we photograph a neighbourhood and then jointly pick pictures for an exhibition at both schools. A smartphone is enough.',
    },
    location: {
      de: 'Treffpunkt: Anka Bilim, Haupteingang',
      tr: 'Buluşma: Anka Bilim, ana giriş',
      en: 'Meeting point: Anka Bilim, main entrance',
    },
    audience: { de: 'Alle Klassenstufen', tr: 'Tüm sınıflar', en: 'All grades' },
    capacity: 20,
    topics: ['arts', 'culture'],
    format: 'project',
    hostSchoolId: 'anka',
    schoolIds: ['anka', 'ers'],
    status: 'planned',
    organizerIds: ['elif'],
  },
  {
    id: 'e5',
    dayOffset: 20,
    time: '18:00',
    durationMinutes: 60,
    online: true,
    title: {
      de: 'Online-Infoabend: Studieren in Deutschland',
      tr: "Çevrim İçi Bilgi Akşamı: Almanya'da Üniversite",
      en: 'Online Info Evening: Studying in Germany',
    },
    summary: {
      de: 'Fragen rund um Bewerbung, Sprachnachweise und Studienwahl.',
      tr: 'Başvuru, dil belgeleri ve bölüm seçimi hakkında sorular.',
      en: 'Questions about applications, language certificates and choosing a degree.',
    },
    description: {
      de: 'Schüler:innen sammeln vorab Fragen und sprechen gemeinsam über Wege ins Studium in Deutschland. Teilnahme per Videokonferenz; der Link wird von der Schule verschickt.',
      tr: "Öğrenciler önceden sorularını topluyor ve Almanya'da üniversiteye giden yolları birlikte konuşuyor. Katılım video konferansla; bağlantı okul tarafından gönderilir.",
      en: 'Students collect questions in advance and discuss paths to university in Germany together. Participation via video call; the link is sent by the school.',
    },
    location: { de: 'Online', tr: 'Çevrim içi', en: 'Online' },
    audience: { de: 'Klassen 10–12', tr: '10–12. sınıflar', en: 'Grades 10–12' },
    capacity: null,
    topics: ['career', 'languages'],
    format: 'online',
    hostSchoolId: 'ers',
    schoolIds: ['ers'],
    status: 'planned',
    organizerIds: [],
  },
  {
    id: 'e6',
    dayOffset: 26,
    time: '10:00',
    durationMinutes: 240,
    title: {
      de: 'Volleyballturnier ERS × Anka Bilim',
      tr: 'ERS × Anka Bilim Voleybol Turnuvası',
      en: 'Volleyball Tournament ERS × Anka Bilim',
    },
    summary: {
      de: 'Gemischte Teams, faire Regeln, viel Bewegung.',
      tr: 'Karma takımlar, adil kurallar, bol hareket.',
      en: 'Mixed teams, fair rules, lots of action.',
    },
    description: {
      de: 'Die Teams werden aus Spieler:innen beider Schulen gemischt, damit man sich kennenlernt. Zuschauer:innen sind ebenfalls willkommen.',
      tr: 'Takımlar, öğrencilerin birbirini tanıması için iki okulun oyuncularından karışık oluşturulur. İzleyiciler de davetlidir.',
      en: 'Teams mix players from both schools so people get to know each other. Spectators are welcome too.',
    },
    location: { de: 'Anka Bilim, Sporthalle', tr: 'Anka Bilim, spor salonu', en: 'Anka Bilim, sports hall' },
    audience: { de: 'Klassen 8–12', tr: '8–12. sınıflar', en: 'Grades 8–12' },
    capacity: 48,
    topics: ['sports'],
    format: 'competition',
    hostSchoolId: 'anka',
    schoolIds: ['anka', 'ers'],
    status: 'planned',
    organizerIds: [],
  },
  {
    id: 'e7',
    dayOffset: 7,
    time: '16:00',
    durationMinutes: 90,
    title: {
      de: 'Musik-Jam & offene Chorprobe',
      tr: "Müzik Jam'i ve Açık Koro Provası",
      en: 'Music Jam & Open Choir Rehearsal',
    },
    summary: {
      de: 'Gemeinsam singen und spielen – mit Liedern auf Deutsch, Türkisch und Englisch.',
      tr: 'Almanca, Türkçe ve İngilizce şarkılarla birlikte söyleyip çalmak.',
      en: 'Sing and play together – with songs in German, Turkish and English.',
    },
    description: {
      de: 'Der Chor von Anka Bilim öffnet seine Probe für Gäste. Bringt gern ein Instrument mit; Noten werden vorab geteilt.',
      tr: 'Anka Bilim korosu provasını misafirlere açıyor. Enstrümanınızı getirebilirsiniz; notalar önceden paylaşılır.',
      en: 'The Anka Bilim choir opens its rehearsal to guests. Feel free to bring an instrument; sheet music is shared in advance.',
    },
    location: { de: 'Anka Bilim, Musikraum', tr: 'Anka Bilim, müzik sınıfı', en: 'Anka Bilim, music room' },
    audience: { de: 'Alle Klassenstufen', tr: 'Tüm sınıflar', en: 'All grades' },
    capacity: 25,
    topics: ['music', 'culture'],
    format: 'meetup',
    hostSchoolId: 'anka',
    schoolIds: ['anka'],
    status: 'confirmed',
    organizerIds: [],
  },
  {
    id: 'e8',
    dayOffset: -10,
    time: '14:00',
    durationMinutes: 90,
    title: {
      de: 'Naturwissenschafts-Quiz',
      tr: 'Fen Bilimleri Yarışması',
      en: 'Science Quiz',
    },
    summary: {
      de: 'Teams aus beiden Schulen beantworten Fragen aus Physik, Chemie und Biologie.',
      tr: 'İki okuldan takımlar fizik, kimya ve biyoloji sorularını yanıtlıyor.',
      en: 'Teams from both schools answer questions on physics, chemistry and biology.',
    },
    description: {
      de: 'Beispiel für eine abgeschlossene Veranstaltung im Demo-Modus. Nach echten Veranstaltungen sollen hier Ergebnisse und Rückmeldungen dokumentiert werden.',
      tr: 'Demo modunda tamamlanmış bir etkinlik örneği. Gerçek etkinliklerden sonra sonuçlar ve geri bildirimler burada belgelenecek.',
      en: 'Example of a completed event in demo mode. After real events, results and feedback will be documented here.',
    },
    location: { de: 'ERS, Physikraum', tr: 'ERS, fizik laboratuvarı', en: 'ERS, physics room' },
    audience: { de: 'Klassen 9–12', tr: '9–12. sınıflar', en: 'Grades 9–12' },
    capacity: 30,
    topics: ['science'],
    format: 'competition',
    hostSchoolId: 'ers',
    schoolIds: ['ers', 'anka'],
    status: 'completed',
    organizerIds: [],
  },
];

export const events = seeds.map(({ dayOffset, time, ...event }) => ({
  ...event,
  online: Boolean(event.online),
  start: relativeDate(dayOffset, time),
  isDemo: true,
}));

export function getEvent(id) {
  return events.find((event) => event.id === id);
}
