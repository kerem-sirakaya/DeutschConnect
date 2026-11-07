// Pure matching rules shared by the local demo and a future data service.
// Matching is deliberately explainable; unknown topics remain usable as free text.
function fold(value) {
  return String(value || '').toLocaleLowerCase('de').replace(/ı/g, 'i').replace(/ß/g, 'ss')
    .normalize('NFKD').replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}

const topicGroups = {
  technology: ['technology', 'technik', 'technologie', 'teknoloji', 'coding', 'programmieren', 'programmierung', 'programming', 'programlama', 'kodlama', 'informatik', 'bilgisayar', 'bilgisayar bilimi'],
  science: ['science', 'wissenschaft', 'wissenschaften', 'naturwissenschaft', 'naturwissenschaften', 'bilim', 'fen'],
  language: ['language', 'languages', 'sprache', 'sprachen', 'dil', 'diller'],
  culture: ['culture', 'kultur', 'kulturler', 'kultureller austausch', 'cultural exchange', 'kulturel degisim'],
  music: ['music', 'musik', 'muzik'],
  art: ['art', 'kunst', 'sanat'],
  environment: ['environment', 'umwelt', 'cevre', 'sustainability', 'nachhaltigkeit', 'surdurulebilirlik'],
  sport: ['sport', 'sports', 'spor'],
  interview: ['interview', 'interviews', 'roportaj'],
};
const subjectGroups = {
  math: ['math', 'maths', 'mathematics', 'mathematik', 'matematik'],
  german: ['german', 'deutsch', 'deutschunterricht', 'almanca'],
  coding: ['coding', 'programming', 'programmieren', 'programmierung', 'informatik', 'kodlama', 'programlama', 'bilgisayar bilimi'],
};
const aliases = (groups) => new Map(Object.entries(groups).flatMap(([key, values]) => values.map((value) => [fold(value), key])));
const topics = aliases(topicGroups);
const subjects = aliases(subjectGroups);

export function normalizeTopic(value) { const key = fold(value); return topics.get(key) || subjects.get(key) || key; }
export function normalizeSubject(value) { const key = fold(value); return subjects.get(key) || key; }
export function isActive(record) { return !record.lifecycle || record.lifecycle === 'active'; }

const stopWords = new Set(['und', 'and', 've', 'the', 'der', 'die', 'das', 'fur', 'for', 'mit', 'with', 'bir', 'okul', 'schule', 'school']);
function topicKeys(values = []) {
  const result = new Set();
  for (const value of values) {
    const full = normalizeTopic(value);
    if (full) result.add(full);
    for (const word of fold(value).split(' ')) {
      if (word.length > 2 && !stopWords.has(word)) result.add(normalizeTopic(word));
    }
  }
  return result;
}
function overlap(left, right) { return [...left].filter((value) => right.has(value)).length; }
const profileTopics = (profile) => topicKeys([...(profile.interests || []), ...(profile.customInterests || [])]);

export function projectMatchScore(idea, profile) {
  if (!isActive(idea)) return 0;
  return overlap(profileTopics(profile), topicKeys([idea.category === 'open' ? '' : idea.category, ...(idea.topics || [])]));
}

export function memberMatchScore(member, profile) { return overlap(profileTopics(member), profileTopics(profile)); }

function subjectOf(record) { return normalizeSubject(record.subjectKey || record.subject); }
function compatible(left, right) {
  return left.kind !== right.kind && subjectOf(left) === subjectOf(right) && Boolean(subjectOf(left)) &&
    (left.languages || []).some((language) => (right.languages || []).includes(language)) &&
    (left.format === 'either' || right.format === 'either' || left.format === right.format);
}

export function matchingTutoring(profile, modules) {
  const own = modules.tutoring.filter((record) => record.ownerId === profile.id && isActive(record));
  return modules.tutoring.filter((record) => record.ownerId !== profile.id && isActive(record) && own.some((item) => compatible(item, record)));
}

export function discoverTutoring(profile, modules) {
  const matched = new Set(matchingTutoring(profile, modules).map((record) => record.id));
  const subjectInterests = { math: 'science', german: 'language', coding: 'technology' };
  return modules.tutoring.filter((record) => isActive(record) && record.ownerId !== profile.id && !matched.has(record.id))
    .map((record) => ({ record, score: overlap(profileTopics(profile), topicKeys([subjectInterests[subjectOf(record)], record.subject, record.topics])) }))
    .filter(({ score }) => score > 0).sort((a, b) => b.score - a.score).map(({ record }) => record);
}
