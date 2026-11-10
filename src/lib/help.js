/**
 * Aufbau der Hilfe-/FAQ-Seite: Kategorien und Fragen. Die Texte stehen in den Sprachdateien
 * unter help.sections.<kategorie>.<frage>.q / .a – nur Funktionen, die es wirklich gibt.
 */
export const HELP_SECTIONS = [
  { id: 'start', questions: ['what', 'how', 'profile'] },
  { id: 'chat', questions: ['join', 'enter', 'leave', 'private'] },
  { id: 'events', questions: ['discover', 'register', 'cancel', 'cancelled'] },
  { id: 'privacy', questions: ['manage', 'visible', 'privacy'] },
];
