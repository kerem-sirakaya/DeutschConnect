/**
 * Nachhilfe-Börse – Zugriff auf Supabase (Migration 011_tutoring.sql).
 *
 * Reine Funktionen: Der Supabase-Client wird übergeben (testbar ohne echte Datenbank,
 * siehe tests/tutoringApi.test.js). Alle Regeln prüft die Datenbank (RLS + Funktionen).
 *
 *   Einträge lesen:     rpc tutoring_list_entries()   (ohne fremde Namen)
 *   Eintrag anlegen:    insert tutoring_entries        (RLS: eigene ID + eigene Schule)
 *   bearbeiten/schließen/löschen: update/delete        (RLS: nur eigene)
 *   Merken:             insert/delete tutoring_saves   (RLS: nur eigene)
 *   Anfragen:           rpc tutoring_send_request / tutoring_respond_request /
 *                       tutoring_withdraw_request / tutoring_list_requests
 */
import { entryToRow, mapEntryRow, mapRequestRow } from './tutoring.js';

/** Fehler → i18n-Schlüssel. "notInstalled" = Migration 011 fehlt in der Datenbank. */
export function tutoringErrorKey(error) {
  const code = error?.code;
  if (code === 'PGRST202' || code === 'PGRST205' || code === '42P01' || code === '42883') return 'tutoring.errors.notInstalled';
  if (code === 'DC011') return 'tutoring.errors.inactive';
  if (code === 'DC012') return 'tutoring.errors.own';
  if (code === 'DC013') return 'tutoring.errors.duplicate';
  if (code === 'DC014') return 'tutoring.errors.transition';
  if (code === '23514') return 'tutoring.errors.rejectedByServer';
  if (code === '22023') return 'tutoring.errors.invalid';
  if (code === 'P0002') return 'tutoring.errors.notFound';
  if (code === '42501') return 'tutoring.errors.notAllowed';
  return 'tutoring.errors.generic';
}

export async function fetchTutoringEntries(client) {
  const { data, error } = await client.rpc('tutoring_list_entries');
  if (error) throw error;
  return (data ?? []).map(mapEntryRow);
}

export async function fetchTutoringRequests(client) {
  const { data, error } = await client.rpc('tutoring_list_requests');
  if (error) throw error;
  return (data ?? []).map(mapRequestRow);
}

export async function fetchTutoringState(client) {
  const [entries, requests] = await Promise.all([fetchTutoringEntries(client), fetchTutoringRequests(client)]);
  return { entries, requests };
}

/** Neuer Eintrag. school_id muss die eigene Schule sein (sonst lehnt RLS ab). */
export async function createTutoringEntry(client, userId, schoolId, values) {
  const { data, error } = await client
    .from('tutoring_entries')
    .insert({ ...entryToRow(values), owner_id: userId, school_id: schoolId })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

export async function updateTutoringEntry(client, entryId, values) {
  const { data, error } = await client.from('tutoring_entries').update(entryToRow(values)).eq('id', entryId).select('id');
  if (error) throw error;
  // RLS filtert fremde Zeilen still heraus → 0 Zeilen = nicht erlaubt / nicht gefunden
  if (!data?.length) throw { code: 'P0002' };
}

export async function setTutoringEntryStatus(client, entryId, status) {
  const { data, error } = await client.from('tutoring_entries').update({ status }).eq('id', entryId).select('id');
  if (error) throw error;
  if (!data?.length) throw { code: 'P0002' };
}

export async function deleteTutoringEntry(client, entryId) {
  const { data, error } = await client.from('tutoring_entries').delete().eq('id', entryId).select('id');
  if (error) throw error;
  if (!data?.length) throw { code: 'P0002' };
}

export async function setTutoringSaved(client, userId, entryId, saved) {
  const query = saved
    ? client.from('tutoring_saves').insert({ entry_id: entryId, user_id: userId })
    : client.from('tutoring_saves').delete().eq('entry_id', entryId).eq('user_id', userId);
  const { error } = await query;
  // 23505 = schon gemerkt → gewünschter Zustand ist bereits erreicht
  if (error && error.code !== '23505') throw error;
}

export async function sendTutoringRequest(client, entryId, message) {
  const { data, error } = await client.rpc('tutoring_send_request', { p_entry_id: entryId, p_message: message.trim() });
  if (error) throw error;
  return data;
}

export async function respondTutoringRequest(client, requestId, accept, note) {
  const { error } = await client.rpc('tutoring_respond_request', {
    p_request_id: requestId,
    p_accept: accept,
    p_note: note?.trim() ? note.trim() : null,
  });
  if (error) throw error;
}

export async function withdrawTutoringRequest(client, requestId) {
  const { error } = await client.rpc('tutoring_withdraw_request', { p_request_id: requestId });
  if (error) throw error;
}
