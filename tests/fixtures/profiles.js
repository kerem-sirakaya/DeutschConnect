// TESTDATEN (fiktiv) – nur für automatische Tests. Die App verwendet diese Datei NICHT (früherer Demo-Modus).
/**
 * DEMO-PROFILE – fiktive Schüler:innen, keine echten Personen.
 *
 * Die Profilauswahl ist KEINE Anmeldung. Sie zeigt nur, wie sich die App je nach
 * Person verändert. Später ersetzt ein echtes Benutzerkonto (mit Login und
 * Datenbank) diese Liste. Die Felder sind bewusst so gewählt, dass sie einem
 * späteren Datenbankschema entsprechen können.
 *
 * registrations: eventId -> 'registered' | 'interested'
 * invitations:   persönliche Einladungen (nur wenn hier eingetragen!)
 */
export const demoProfiles = [
  {
    id: 'alex',
    firstName: 'Alex',
    lastName: 'Demir',
    schoolId: 'ers',
    grade: 11,
    avatarColor: '#2f6fd6',
    interests: ['languages', 'science', 'debate', 'career'],
    registrations: { e1: 'registered', e8: 'registered' },
    supportedIdeas: ['i3', 'i6'],
    invitations: [{ id: 'inv-alex-e5', eventId: 'e5', fromSchoolId: 'ers' }],
  },
  {
    id: 'elif',
    firstName: 'Elif',
    lastName: 'Kaya',
    schoolId: 'anka',
    grade: 10,
    avatarColor: '#7c5cd6',
    interests: ['arts', 'music', 'culture', 'languages'],
    registrations: { e7: 'registered', e2: 'interested' },
    supportedIdeas: ['i1', 'i4'],
    invitations: [{ id: 'inv-elif-e1', eventId: 'e1', fromSchoolId: 'ers' }],
  },
  {
    id: 'deniz',
    firstName: 'Deniz',
    lastName: 'Yıldız',
    schoolId: 'ers',
    grade: 9,
    avatarColor: '#1b7a63',
    interests: ['sports', 'technology', 'music'],
    registrations: { e6: 'interested' },
    supportedIdeas: ['i1'],
    invitations: [],
  },
];

export function getDemoProfile(id) {
  return demoProfiles.find((profile) => profile.id === id) ?? demoProfiles[0];
}
