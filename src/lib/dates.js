const DAY_MS = 24 * 60 * 60 * 1000;

export function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Ganze Kalendertage von heute bis zum Datum (negativ = Vergangenheit). */
export function daysUntil(date, now = new Date()) {
  return Math.round((startOfDay(date) - startOfDay(now)) / DAY_MS);
}

/**
 * Erzeugt ein Datum relativ zu heute. Nur für Testdaten (tests/fixtures): So bleiben die
 * Beispiel-Events immer „bevorstehend“, egal wann die App geöffnet wird.
 */
export function relativeDate(dayOffset, time = '00:00', base = new Date()) {
  const d = startOfDay(base);
  d.setDate(d.getDate() + dayOffset);
  const [hours, minutes] = time.split(':').map(Number);
  d.setHours(hours, minutes, 0, 0);
  return d.toISOString();
}

export function addMinutes(date, minutes) {
  return new Date(new Date(date).getTime() + minutes * 60 * 1000);
}
