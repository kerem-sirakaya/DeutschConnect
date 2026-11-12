/**
 * Profile + Statistik – Zugriff auf Supabase (Migration 012_profiles_stats.sql).
 * Der Client wird übergeben (testbar ohne echte Datenbank, siehe tests/profiles.test.js).
 *
 *   eigene Freigaben lesen:            profile_sharing      (RLS: nur eigene Zeile)
 *   eigene Freigaben speichern:        rpc save_profile_sharing(...)
 *   eigene Statistik:                  rpc get_my_activity_stats()
 *   Verzeichnis:                       rpc list_public_profiles()
 *   ein Profil:                        rpc get_public_profile(p_user_id)
 */
import { mapDirectoryRow, mapPublicProfileRow, mapSharingRow, mapStatsRow, sharingToRow } from './profiles.js';

export async function fetchMySharing(client, userId) {
  const { data, error } = await client
    .from('profile_sharing')
    .select('is_public, show_school, show_interests, show_projects, show_activity')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return mapSharingRow(data);
}

/**
 * Speichert die Freigaben und gibt den von der Datenbank bestätigten Stand zurück.
 * Über die Funktion save_profile_sharing(): Sie schreibt IMMER die Zeile von auth.uid() –
 * eine fremde ID kann man gar nicht übergeben.
 */
export async function saveMySharing(client, sharing) {
  const row = sharingToRow(sharing);
  const { data, error } = await client.rpc('save_profile_sharing', {
    p_is_public: row.is_public,
    p_show_school: row.show_school,
    p_show_interests: row.show_interests,
    p_show_projects: row.show_projects,
    p_show_activity: row.show_activity,
  });
  if (error) throw error;
  return mapSharingRow(Array.isArray(data) ? data[0] : data);
}

export async function fetchMyStats(client) {
  const { data, error } = await client.rpc('get_my_activity_stats');
  if (error) throw error;
  return mapStatsRow(Array.isArray(data) ? data[0] : data);
}

export async function fetchPublicProfiles(client) {
  const { data, error } = await client.rpc('list_public_profiles');
  if (error) throw error;
  return (data ?? []).map(mapDirectoryRow);
}

/** null = privat ODER nicht vorhanden (bewusst nicht unterscheidbar). */
export async function fetchPublicProfile(client, userId) {
  const { data, error } = await client.rpc('get_public_profile', { p_user_id: userId });
  if (error) throw error;
  return mapPublicProfileRow(Array.isArray(data) ? data[0] : data);
}
