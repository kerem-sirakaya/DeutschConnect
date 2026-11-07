// Fictional demo schedule, never confirmed school events.
export const activities = [
  { id: 'codewerkstatt', category: 'technology', icon: 'code', hostSchoolId: 'ers', schoolIds: ['ers', 'anka'], startsAt: '2026-11-19T14:00:00+03:00' },
  { id: 'sprachwerkstatt', category: 'language', icon: 'chat', hostSchoolId: 'anka', schoolIds: ['ers', 'anka'], startsAt: '2026-11-21T13:00:00+03:00' },
  { id: 'ideenlabor', category: 'science', icon: 'science', hostSchoolId: 'ers', schoolIds: ['ers', 'anka'], startsAt: '2026-11-25T14:00:00+03:00' },
  { id: 'kulturbruecken', category: 'culture', icon: 'globe', hostSchoolId: 'anka', schoolIds: ['ers', 'anka'], startsAt: '2026-11-28T13:00:00+03:00' },
];

export const interests = ['technology', 'science', 'language', 'culture'];

export const schools = [
  { id: 'ers', initials: 'ERS', name: 'Ernst-Reuter-Schule', city: 'Ankara' },
  { id: 'anka', initials: 'AB', name: 'Anka Bilim', city: 'Ankara' },
];

export function eventDate(activity, language, options = {}) {
  return new Intl.DateTimeFormat({ de: 'de-DE', tr: 'tr-TR', en: 'en-GB' }[language], {
    day: 'numeric', month: 'short', timeZone: 'Europe/Istanbul', ...options,
  }).format(new Date(activity.startsAt));
}

export function eventContent(activity, translations) {
  // Demo records use translated seed content; future records can carry their own text.
  return activity.title ? activity : translations.activities[activity.id];
}

export function filterEvents(source, { category, school, query }, translations, language) {
  const search = query.trim().toLocaleLowerCase(language);
  return source.filter((activity) => {
    const content = eventContent(activity, translations);
    const text = [content.title, content.description, translations.categories[activity.category]].join(' ').toLocaleLowerCase(language);
    return (category === 'all' || activity.category === category) &&
      (school === 'all' || activity.hostSchoolId === school) && text.includes(search);
  });
}
