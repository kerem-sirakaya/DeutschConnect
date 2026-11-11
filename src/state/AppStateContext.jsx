import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAccountEvents } from './useAccountEvents.js';
import { useAccountIdeas } from './useAccountIdeas.js';
import { visibleToStudents } from '../lib/eventArchive.js';
import { visibleOrOwn } from '../lib/schoolVisibility.js';
import {
  ACCOUNT_STORAGE_PREFIX,
  GUEST_USER,
  buildAccountUser,
  emptyAccountData,
  sanitizeAccountData,
} from '../lib/accountProfile.js';
import { useAuth } from '../auth/AuthContext.jsx';
import ProfileGate from '../components/ProfileGate.jsx';

// Wie oft die Archiv-Ausblendung neu berechnet wird (Events verschwinden pünktlich,
// auch wenn die Seite lange offen bleibt)
const ARCHIVE_TICK_MS = 5 * 60 * 1000;

/**
 * ZENTRALER ZUSTAND der App – alle Seiten lesen das aktive Profil über useAppState().
 *
 * Zwei Modi:
 *   1. GAST (niemand angemeldet): KEINE erfundenen Profile, Events oder Ideen. Die Datenbank (RLS) gibt
 *      Gästen keine Inhalte heraus; Seiten für Mitglieder zeigen stattdessen „Bitte anmelden“
 *      (components/RequireAccount.jsx). Aktionen sind ohne Konto nicht möglich.
 *   2. ECHTES KONTO (Supabase-Login): Name, Schule, Klasse, Avatar-Farbe und Interessen
 *      kommen aus der Tabelle "profiles", Events aus "events" und die eigenen
 *      Event-Anmeldungen aus "event_registrations" (siehe useAccountEvents.js),
 *      Ideen + Unterstützungen aus "ideas"/"idea_supports" (siehe useAccountIdeas.js).
 *      Nur ausgeblendete Hinweise liegen noch im Browser – in einem EIGENEN Schlüssel pro Konto.
 *
 * Früher gab es einen Demo-Modus mit fiktiven Profilen („Alex“) und Beispiel-Inhalten. Er ist entfernt;
 * die Beispieldaten liegen nur noch als Test-Daten unter tests/fixtures/.
 */

/** mode: 'guest' | 'loading' | 'error' | 'account' */
export const GUEST_MODE = 'guest';

const toggleItem = (list, item) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);

/** Lokal gespeicherte Daten des Kontos (nur ausgeblendete Hinweise – alles andere liegt in Supabase). */
function accountReducer(data, action) {
  switch (action.type) {
    case 'dismissUpdate':
      return { ...data, dismissedUpdates: [...new Set([...data.dismissedUpdates, action.updateId])] };
    default:
      return data;
  }
}

function loadAccountData(userId) {
  try {
    return sanitizeAccountData(JSON.parse(localStorage.getItem(ACCOUNT_STORAGE_PREFIX + userId)));
  } catch {
    return emptyAccountData();
  }
}

const LOGIN_REQUIRED = Object.freeze({ errorKey: 'guest.loginRequiredText' });

/** Aktionen für Gäste: nichts wird gespeichert oder erfunden – nur ein ehrlicher Hinweis. */
const GUEST_ACTIONS = Object.freeze({
  setRegistration: async () => false,
  toggleInterest: () => {},
  toggleIdeaSupport: () => {},
  dismissUpdate: () => {},
  addIdea: async () => LOGIN_REQUIRED,
  deleteIdea: async () => LOGIN_REQUIRED,
});

const GUEST_VALUE = Object.freeze({
  mode: GUEST_MODE,
  isRealAccount: false,
  user: GUEST_USER,
  events: Object.freeze([]),
  getEvent: () => undefined,
  staffEvents: Object.freeze([]),
  registrationSync: Object.freeze({ pending: Object.freeze({}), error: null }),
  ideas: Object.freeze([]),
  supportCounts: Object.freeze({}),
  ideaSync: Object.freeze({ pending: Object.freeze({}), error: null }),
  actions: GUEST_ACTIONS,
});

const AppStateContext = createContext(null);

export function AppStateProvider({ children }) {
  const auth = useAuth();
  const [account, setAccount] = useState({ userId: null, data: null });
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), ARCHIVE_TICK_MS);
    return () => clearInterval(id);
  }, []);

  // Lokale Daten des angemeldeten Kontos laden – direkt beim Rendern, sobald sich
  // das Konto ändert (React-Muster "State beim Rendern anpassen", kein extra Ladeschritt) ...
  const authUserId = auth.user?.id ?? null;
  if (authUserId && account.userId !== authUserId) {
    setAccount({ userId: authUserId, data: loadAccountData(authUserId) });
  }

  // ... und speichern (eigener Schlüssel pro Konto)
  useEffect(() => {
    if (!account.userId) return;
    try {
      localStorage.setItem(ACCOUNT_STORAGE_PREFIX + account.userId, JSON.stringify(account.data));
    } catch {
      // Speicher nicht verfügbar
    }
  }, [account]);

  // Echte Events, Ideen + eigene Anmeldungen/Unterstützungen (nur wenn angemeldet und Profil geladen)
  const profileReady = Boolean(auth.user && auth.profile && !auth.profileLoading);
  const accountEvents = useAccountEvents(profileReady ? auth.user.id : null);
  const accountIdeas = useAccountIdeas(profileReady ? auth.user.id : null);

  const isPreparing = (status) => status === 'loading' || status === 'idle';

  let mode = GUEST_MODE;
  let gateError = null; // { titleKey, messageKey, retry }
  if (auth.isConfigured && auth.loading) mode = 'loading';
  else if (auth.user) {
    if (auth.profileLoading || account.userId !== auth.user.id) mode = 'loading';
    else if (auth.profileError || !auth.profile) {
      mode = 'error';
      gateError = { titleKey: null, messageKey: null, retry: auth.reloadProfile };
    } else if (accountEvents.status === 'error') {
      mode = 'error';
      gateError = { titleKey: 'auth.gateEventsErrorTitle', messageKey: 'auth.errors.eventsLoad', retry: accountEvents.reload };
    } else if (accountIdeas.status === 'error') {
      mode = 'error';
      gateError = { titleKey: 'auth.gateIdeasErrorTitle', messageKey: 'auth.errors.ideasLoad', retry: accountIdeas.reload };
    } else if (isPreparing(accountEvents.status) || isPreparing(accountIdeas.status)) mode = 'loading';
    else mode = 'account';
  }
  const isAccount = mode === 'account';

  const dispatchAccount = useCallback(
    (action) => setAccount((prev) => (prev.userId ? { ...prev, data: accountReducer(prev.data, action) } : prev)),
    [],
  );

  const accountInterests = isAccount ? auth.profile.interests ?? [] : null;
  const accountSchoolId = isAccount ? auth.profile.school_id : null;
  const { updateInterests } = auth;
  const saveAccountRegistration = accountEvents.setRegistration;
  const { toggleSupport: toggleAccountSupport, createIdea: createAccountIdea, deleteIdea: deleteAccountIdea } =
    accountIdeas;

  const actions = useMemo(
    () => ({
      // Direkt in Supabase (event_registrations). Promise<boolean>: true = von Supabase bestätigt.
      setRegistration: (eventId, status) => saveAccountRegistration(eventId, status),
      toggleInterest: (topic) => updateInterests(toggleItem(accountInterests ?? [], topic)),
      // Direkt in Supabase (idea_supports)
      toggleIdeaSupport: (ideaId) => toggleAccountSupport(ideaId),
      dismissUpdate: (updateId) => dispatchAccount({ type: 'dismissUpdate', updateId }),
      /** Speichert eine neue Idee. Promise: { id } bei Erfolg oder { errorKey } bei einem Fehler. */
      addIdea: (idea) => createAccountIdea(idea, accountSchoolId),
      /** Löscht eine eigene Idee. Promise mit {} oder { errorKey }. */
      deleteIdea: (ideaId) => deleteAccountIdea(ideaId),
    }),
    [
      dispatchAccount,
      updateInterests,
      saveAccountRegistration,
      accountInterests,
      accountSchoolId,
      toggleAccountSupport,
      createAccountIdea,
      deleteAccountIdea,
    ],
  );

  const value = useMemo(() => {
    if (mode !== 'account') return GUEST_VALUE;
    // Archivierte Events (24 h nach Ende; abgesagt: nach Ende UND Absage) für Schüler:innen überall ausblenden –
    // Listen, "Meine", Startseite, Schulen, Empfehlungen UND Detailseite (getEvent).
    // Anmeldungen bleiben unverändert in accountEvents.registrations.
    // Zusätzlich: Events ausgeblendeter Schulen nicht anzeigen (nur Anzeige, Daten bleiben) – AUSSER mit
    // eigener Anmeldung: dann nur für diese Person (ownOnly → „Meine Events“, Detailseite; nicht in öffentlichen Listen).
    const studentEvents = visibleToStudents(accountEvents.events, now);
    const events = visibleOrOwn(studentEvents, (event) => Boolean(accountEvents.registrations[event.id]));
    return {
      mode,
      isRealAccount: true,
      user: buildAccountUser(auth.user.id, auth.profile, account.data, accountEvents.registrations, accountIdeas.supported),
      events,
      getEvent: (id) => events.find((event) => event.id === id),
      /**
       * NUR für Moderation/Admin (Eventgruppen anlegen, /chat/moderation): veröffentlichte, nicht archivierte
       * Events OHNE Schul-Ausblendung. Dieselben Zeilen, die die Datenbank (RLS) ohnehin liefert – keine
       * zusätzlichen Rechte. Nicht in Schüler-Ansichten verwenden.
       */
      staffEvents: studentEvents,
      /** Speicherzustand der echten Anmeldungen (für die Event-Detailseite) */
      registrationSync: { pending: accountEvents.pending, error: accountEvents.saveError },
      // NUR echte Ideen aus Supabase. Ideen ausgeblendeter Schulen nicht anzeigen – AUSSER die eigenen
      // (ownOnly, nur für die Autor:in)
      ideas: visibleOrOwn(accountIdeas.ideas, (idea) => idea.authorId === auth.user.id),
      // Zahlen aus der Datenbank-Funktion get_idea_support_counts()
      supportCounts: accountIdeas.counts,
      /** Speicherzustand der echten Unterstützungen */
      ideaSync: { pending: accountIdeas.pending, error: accountIdeas.saveError },
      actions,
    };
  }, [
    mode,
    now,
    auth.user,
    auth.profile,
    account,
    actions,
    accountEvents.events,
    accountEvents.registrations,
    accountEvents.pending,
    accountEvents.saveError,
    accountIdeas.ideas,
    accountIdeas.supported,
    accountIdeas.counts,
    accountIdeas.pending,
    accountIdeas.saveError,
  ]);

  if (mode === 'loading' || mode === 'error') {
    return (
      <ProfileGate
        status={mode}
        titleKey={gateError?.titleKey}
        messageKey={gateError?.messageKey}
        onRetry={gateError?.retry}
      />
    );
  }

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  const context = useContext(AppStateContext);
  if (!context) throw new Error('useAppState muss innerhalb von <AppStateProvider> verwendet werden.');
  return context;
}
