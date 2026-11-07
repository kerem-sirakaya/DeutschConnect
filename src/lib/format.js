// Datumsformatierung über die eingebaute Intl-API – automatisch in DE/TR/EN.

export function formatMonthShort(date, locale) {
  return new Intl.DateTimeFormat(locale, { month: 'short' }).format(new Date(date)).replace(/\.$/, '');
}

export function formatWeekdayTime(date, locale) {
  return new Intl.DateTimeFormat(locale, { weekday: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(date));
}

export function formatDateLong(date, locale) {
  return new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(
    new Date(date),
  );
}

export function formatTime(date, locale) {
  return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(new Date(date));
}

/** z. B. „morgen“, „in 5 Tagen“, „vor 3 Tagen“ */
export function formatRelativeDays(days, locale) {
  return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(days, 'day');
}
