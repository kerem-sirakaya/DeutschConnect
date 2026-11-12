/**
 * Echte Ideen + Unterstützungen aus Supabase.
 *
 * Reine Funktionen: Der Supabase-Client wird übergeben (testbar mit
 * tests/ideasApi.test.js, ohne echte Datenbank).
 *
 * Datenbank-Regeln (RLS, siehe supabase/migrations/001 + 004):
 *   - ideas lesen: freigegebene Ideen (collecting/review/planned) + alle EIGENEN
 *   - ideas anlegen: nur als man selbst, nur für die eigene Schule, Status 'submitted'
 *   - ideas löschen: nur eigene; ändern: gar nicht (Status ändern nur Admins)
 *   - idea_supports: nur eigene lesen/löschen; anlegen nur für FREMDE FREIGEGEBENE Ideen
 *   - Zahlen: get_idea_support_counts() – zählt ohne Namen, nur sichtbare Ideen
 */

/** Status, in denen eine Idee für andere sichtbar ist und unterstützt werden darf. */
export const PUBLIC_IDEA_STATUSES = ['collecting', 'review', 'planned'];

export const IDEA_COLUMNS =
  'id, author_id, school_id, title, summary, description, topics, format, school_ids, status, created_at';

/** Datenbank-Zeile -> Ideen-Objekt der App (gleiche Form wie die Testdaten in tests/fixtures/ideas.js). */
export function mapDbIdea(row) {
  return {
    id: row.id,
    authorId: row.author_id,
    schoolId: row.school_id,
    title: row.title,
    summary: row.summary ?? '',
    description: row.description ?? '',
    topics: Array.isArray(row.topics) ? row.topics : [],
    format: row.format,
    schoolIds: Array.isArray(row.school_ids) ? row.school_ids : [],
    status: row.status,
    createdAt: row.created_at,
    isDemo: false,
    isLocal: false,
  };
}

/** Darf diese Person diese Idee unterstützen? (Die Datenbank prüft es zusätzlich.) */
export function canSupportIdea(idea, userId) {
  return idea.authorId !== userId && PUBLIC_IDEA_STATUSES.includes(idea.status);
}

export async function fetchIdeas(client) {
  const { data, error } = await client.from('ideas').select(IDEA_COLUMNS).order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapDbIdea);
}

/** IDs der Ideen, die die Person selbst unterstützt. */
export async function fetchMySupports(client, userId) {
  const { data, error } = await client.from('idea_supports').select('idea_id').eq('user_id', userId);
  if (error) throw error;
  return (data ?? []).map((row) => row.idea_id);
}

/** { [ideaId]: Anzahl } – über die Datenbank-Funktion, die keine Namen verrät. */
export async function fetchSupportCounts(client) {
  const { data, error } = await client.rpc('get_idea_support_counts');
  if (error) throw error;
  const counts = {};
  for (const row of data ?? []) counts[row.idea_id] = Number(row.supporters) || 0;
  return counts;
}

/** Lädt alles auf einmal. Unterstützungen für Ideen, die man nicht (mehr) sieht, werden ausgeblendet. */
export async function fetchIdeasState(client, userId) {
  const [ideas, supported, counts] = await Promise.all([
    fetchIdeas(client),
    fetchMySupports(client, userId),
    fetchSupportCounts(client),
  ]);
  const visible = new Set(ideas.map((idea) => idea.id));
  return { ideas, supported: supported.filter((id) => visible.has(id)), counts };
}

/**
 * Neue Idee anlegen. Status wird NICHT mitgeschickt – die Datenbank setzt 'submitted'.
 * school_id muss die Schule aus dem eigenen Profil sein (sonst lehnt RLS ab).
 */
export async function createIdea(client, { userId, schoolId, idea }) {
  const { data, error } = await client
    .from('ideas')
    .insert({
      author_id: userId,
      school_id: schoolId,
      title: idea.title,
      summary: idea.summary,
      description: idea.description,
      topics: idea.topics,
      format: idea.format,
      school_ids: idea.schoolIds,
    })
    .select(IDEA_COLUMNS)
    .single();
  if (error) return { error };
  return { idea: mapDbIdea(data) };
}

export async function addSupport(client, { userId, ideaId }) {
  return client.from('idea_supports').insert({ idea_id: ideaId, user_id: userId });
}

export async function removeSupport(client, { userId, ideaId }) {
  return client.from('idea_supports').delete().eq('idea_id', ideaId).eq('user_id', userId);
}

/** Eigene Idee löschen. Gibt einen Fehler zurück, wenn nichts gelöscht wurde. */
export async function deleteOwnIdea(client, { userId, ideaId }) {
  const { data, error } = await client.from('ideas').delete().eq('id', ideaId).eq('author_id', userId).select('id');
  if (error) return { error };
  if (!data || data.length === 0) return { error: { code: 'not_deleted' } };
  return { error: null };
}

/** Fehler -> Übersetzungsschlüssel */
export function ideaErrorKey(error) {
  if (!error) return null;
  if (error.code === '42501') return 'ideas.errors.notAllowed'; // von RLS abgelehnt
  if (error.code === '23505') return 'ideas.errors.alreadySupported'; // schon unterstützt
  if (error.code === '23514' || error.code === '23503' || error.code === '22P02') return 'ideas.errors.invalid';
  if (error.code === 'not_deleted') return 'ideas.errors.deleteFailed';
  if (error.name === 'TypeError' || /fetch|network/i.test(error.message ?? '')) return 'ideas.errors.network';
  return 'ideas.errors.generic';
}
