/**
 * Begrüßung nach Tageszeit (lokale Uhrzeit des Geräts):
 *   Morgen 05:00–11:59 · Nachmittag 12:00–17:59 · Abend 18:00–04:59
 */
export function greetingPeriod(date = new Date()) {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  return 'evening';
}

/** Vorname nur, wenn er wirklich Text enthält – sonst null (nie „undefined“/„null“ anzeigen). */
export function greetingName(firstName) {
  if (typeof firstName !== 'string') return null;
  const name = firstName.trim();
  return name && name !== 'undefined' && name !== 'null' ? name : null;
}

// Feste Schlüssel (keine zusammengesetzten Strings), damit die i18n-Prüfung sie findet.
const KEYS = {
  morning: ['home.greetingMorning', 'home.greetingMorningNoName'],
  afternoon: ['home.greetingAfternoon', 'home.greetingAfternoonNoName'],
  evening: ['home.greetingEvening', 'home.greetingEveningNoName'],
};

/** Übersetzungsschlüssel + Werte für die Begrüßung. */
export function greetingMessage(firstName, date = new Date()) {
  const name = greetingName(firstName);
  const [withName, withoutName] = KEYS[greetingPeriod(date)];
  return name ? { key: withName, values: { name } } : { key: withoutName, values: {} };
}
