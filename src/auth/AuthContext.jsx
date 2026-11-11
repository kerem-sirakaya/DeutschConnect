import { createContext, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { initialAuthRedirect, isSupabaseConfigured, recoveryStore, supabase } from '../lib/supabaseClient.js';
import { buildSignUpMetadata } from '../lib/authValidation.js';
import { resetRedirectUrl } from '../lib/passwordRecovery.js';

/**
 * ECHTE Anmeldung über Supabase Auth.
 *
 * Ist jemand angemeldet, macht src/state/AppStateContext.jsx aus dem hier
 * geladenen Profil das aktive Profil der ganzen App. Events, Ideen und Projekte
 * bleiben vorerst Demo-Inhalte – auch nach dem Login.
 *
 * Registrierung ist nur sichtbar, wenn in .env.local VITE_ENABLE_SIGNUP=true steht.
 * Das ist nur ein Schalter für die Oberfläche. Der echte Schutz ist die Einstellung
 * "Allow new users to sign up" im Supabase-Dashboard (siehe README).
 */
export const isSignupEnabled = isSupabaseConfigured && import.meta.env.VITE_ENABLE_SIGNUP === 'true';

const AuthContext = createContext(null);

async function fetchProfile(userId) {
  // Das eigene Profil + Name der Schule (Join auf die Tabelle "schools").
  // RLS erlaubt nur das EIGENE Profil – andere Profile wären hier leer.
  const { data, error } = await supabase
    .from('profiles')
    .select('first_name, grade, school_id, avatar_color, interests, school:schools(name, short_name)')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [sessionLoading, setSessionLoading] = useState(isSupabaseConfigured);
  const [profileResult, setProfileResult] = useState({ userId: null, profile: null, error: null });
  const [reloadToken, setReloadToken] = useState(0);
  const [interestsSaveError, setInterestsSaveError] = useState(null);
  // Speichervorgänge nacheinander ausführen, damit ein älterer nie einen neueren überschreibt.
  const saveQueue = useRef(Promise.resolve());
  // Passwort-Wiederherstellung (Zustand lebt in supabaseClient.js, damit kein Ereignis verloren geht)
  const recovery = useSyncExternalStore(recoveryStore.subscribe, recoveryStore.getState);

  // 1) Sitzung beim Start laden und auf Login/Logout reagieren.
  useEffect(() => {
    if (!supabase) return undefined;
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setSessionLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, newSession) => {
      // Hier KEINE weiteren Supabase-Aufrufe (kann sonst hängen) – nur Zustand setzen.
      setSession(newSession);
      setSessionLoading(false);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  // 2) Sobald jemand angemeldet ist: Profil aus der Datenbank laden.
  const userId = session?.user?.id ?? null;
  useEffect(() => {
    if (!userId) return undefined;
    let active = true;
    fetchProfile(userId)
      .then((profile) => active && setProfileResult({ userId, profile, error: null }))
      .catch((error) => active && setProfileResult({ userId, profile: null, error }));
    return () => {
      active = false;
    };
  }, [userId, reloadToken]);

  const value = useMemo(() => {
    const current = profileResult.userId === userId ? profileResult : { profile: null, error: null };
    return {
      isConfigured: isSupabaseConfigured,
      isSignupEnabled,
      loading: sessionLoading,
      user: session?.user ?? null,
      profile: userId ? current.profile : null,
      profileError: userId ? current.error : null,
      profileLoading: Boolean(userId) && profileResult.userId !== userId,
      interestsSaveError,
      /** Passwort-Wiederherstellung: { userId, linkPending } und Art des Start-Links ('error' → Meldung). */
      recovery,
      initialAuthRedirect,

      /** Profil erneut laden (z. B. nach einem Netzwerkfehler). */
      reloadProfile() {
        setProfileResult({ userId: null, profile: null, error: null });
        setReloadToken((n) => n + 1);
      },

      /**
       * Interessen im eigenen Profil speichern. Die Anzeige ändert sich sofort;
       * schlägt das Speichern fehl, wird der Stand aus der Datenbank neu geladen.
       * Erlaubt durch: grant update (interests) + Policy "eigenes Profil bearbeiten".
       */
      updateInterests(interests) {
        if (!supabase || !userId) return;
        const id = userId;
        setInterestsSaveError(null);
        setProfileResult((prev) =>
          prev.userId === id && prev.profile ? { ...prev, profile: { ...prev.profile, interests } } : prev,
        );
        saveQueue.current = saveQueue.current.then(async () => {
          const { error } = await supabase.from('profiles').update({ interests }).eq('id', id);
          if (!error) return;
          setInterestsSaveError(error);
          try {
            const profile = await fetchProfile(id);
            setProfileResult((prev) => (prev.userId === id ? { ...prev, profile } : prev));
          } catch {
            // Neu laden fehlgeschlagen – Fehlermeldung ist bereits sichtbar
          }
        });
      },

      /** Gibt { error } oder { needsConfirmation } zurück. */
      async signUp(values) {
        if (!isSignupEnabled) return { error: { code: 'signup_disabled' } };
        const { data, error } = await supabase.auth.signUp({
          email: values.email.trim(),
          password: values.password,
          options: {
            data: buildSignUpMetadata(values),
            emailRedirectTo: `${window.location.origin}/login`,
          },
        });
        if (error) return { error };
        // Keine Sitzung = E-Mail muss erst bestätigt werden (Standard bei Supabase).
        return { needsConfirmation: !data.session };
      },

      async signIn({ email, password }) {
        if (!supabase) return { error: { code: 'not_configured' } };
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        return { error };
      },

      /**
       * „Passwort vergessen“: E-Mail mit Link anfordern. Supabase antwortet auch bei unbekannten
       * Adressen gleich – die Oberfläche verrät daher nicht, ob es ein Konto gibt.
       */
      async requestPasswordReset(email) {
        if (!supabase) return { error: { code: 'not_configured' } };
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: resetRedirectUrl(window.location.origin),
        });
        return { error };
      },

      /**
       * Neues Passwort speichern (nur in einer Wiederherstellungs-Sitzung), danach überall abmelden,
       * damit man sich mit dem neuen Passwort anmeldet. Gibt { error } zurück.
       */
      async updatePassword(password) {
        if (!supabase) return { error: { code: 'not_configured' } };
        const { error } = await supabase.auth.updateUser({ password });
        if (error) return { error };
        recoveryStore.clear();
        // Abmelden darf scheitern (z. B. kurz offline) – das Passwort ist trotzdem geändert.
        await supabase.auth.signOut().catch(() => {});
        return { error: null };
      },

      async signOut() {
        if (!supabase) return { error: null };
        setInterestsSaveError(null);
        const { error } = await supabase.auth.signOut();
        return { error };
      },
    };
  }, [session, sessionLoading, userId, profileResult, interestsSaveError, recovery]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth muss innerhalb von <AuthProvider> verwendet werden.');
  return context;
}
