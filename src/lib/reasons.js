/** Macht eine Empfehlung nachvollziehbar: "Passt zu: Sprachen, Debatte · Deine Schule ist dabei" */
export function describeMatch({ matchedTopics = [], schoolMatch = false }, t) {
  const parts = [];
  if (matchedTopics.length) {
    parts.push(t('recommend.matches', { topics: matchedTopics.map((id) => t(`topics.${id}`)).join(', ') }));
  }
  if (schoolMatch) parts.push(t('recommend.yourSchool'));
  return parts.join(' · ');
}
