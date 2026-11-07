/**
 * Inhalte (z. B. Event-Titel) können mehrsprachig ({ de, tr, en }) oder
 * ein einfacher Text sein (von Nutzer:innen eingegeben, nicht übersetzt).
 */
export function localize(value, language) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  return value[language] ?? value.de ?? Object.values(value)[0] ?? '';
}
