import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState } from 'react';
import { demoProfiles, getDemoProfile } from '../data/profiles.js';
import { getSchool } from '../data/schools.js';
import { seedIdeas } from '../data/ideas.js';
import { events as demoEvents } from '../data/events.js';
import { useAccountEvents } from './useAccountEvents.js';
import { useAccountIdeas } from './useAccountIdeas.js';
import { getSupportCounts } from '../lib/selectors.js';
import { visibleToStudents } from '../lib/eventArchive.js';

// Wie oft die Archiv-Ausblendung neu berechnet wird (Events verschwinden pünktlich,
// auch wenn die Seite lange offen bleibt)
const ARCHIVE_TICK_MS = 5 * 60 * 1000;
import {
  ACCOUNT_STORAGE_PREFIX,
  buildAccountUser,
  emptyAccountData,
  sanitizeAccountData,
} from '../lib/accountProfile.js';
import { useAuth } from '../auth/AuthContext.jsx';
import ProfileGate from '../components/ProfileGate.jsx';

/**
 * ZENTRALER ZUSTAND der App – alle Seiten lesen das aktive Profil über useAppState().
 *
 * Zwei getrennte Modi:
 *   1. DEMO (niemand angemeldet): wie bisher. Fiktive Profile, Daten nur im Browser
 *      (localStorage-Schlüssel "deutschconnect.demoState").
 *   2. ECHTES KONTO (Supabase-Login): Name, Schule, Klasse, Avatar-Farbe und Interessen
 *      kommen aus der Tabelle "profiles", Events aus "events" und die eigenen
 *      Event-Anmeldungen aus "event_registrations" (siehe useAccountEvents.js),
 *      Ideen + Unterstützungen aus "ideas"/"idea_supports" (siehe useAccountIdeas.js).
 *      Nur Projekt-Interesse und ausgeblendete Hinweise liegen noch im Browser –
 *      in einem EIGENEN Schlüssel pro Konto, nie zusammen mit den Demo-Daten.
 *      Demo-Events, Demo-Ideen und Demo-Anmeldungen werden im Konto-Modus NIE verwendet.
 *
 * Beim Abmelden ist automatisch wieder das zuletzt gewählte Demo-Profil aktiv,
 * weil der Demo-Zustand während der Anmeldung nicht verändert wird.
 */

const STORAGE_KEY = 'deutschconnect.demoState';
const STATE_VERSION = 1;

function seedProfileState(profile) {
  return {
    interests: [...profile.interests],
    registrations: { ...profile.registrations },
    supportedIdeas: [...profile.supportedIdeas],
    projectInterest: [],
    dismissedUpdates: [],
  };
}

export function createInitialState() {
  return {
    version: STATE_VERSION,
    activeProfileId: demoProfiles[0].id,
    profileState: Object.fromEntries(demoProfiles.map((profile) => [profile.id, seedProfileState(profile)])),
    customIdeas: [],
  };
}

function loadState() {
  const initial = createInitialState();
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved || saved.version !== STATE_VERSION) return initial;
    const profileState = { ...initial.profileState };
    for (const id of Object.keys(profileState)) {
      if (saved.profileState?.[id]) profileState[id] = { ...profileState[id], ...saved.profileState[id] };
    }
    return {
      ...initial,
      activeProfileId: profileState[saved.activeProfileId] ? saved.activeProfileId : initial.activeProfileId,
      profileState,
      customIdeas: Array.isArray(saved.customIdeas) ? saved.customIdeas : [],
    };
  } catch {
    return initial;
  }
}

const toggleItem = (list, item) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);

/** Aktionen, die nur die persönlichen Daten EINES Profils betreffen (Demo oder Konto). */
function applyPersonalAction(p, action) {
  switch (action.type) {
    case 'setRegistration': {
      const registrations = { ...p.registrations };
      if (action.status) registrations[action.eventId] = action.status;
      else delete registrations[action.eventId];
      return { ...p, registrations };
    }
    case 'toggleInterest':
      return { ...p, interests: toggleItem(p.interests, action.topic) };
    case 'toggleIdeaSupport':
      return { ...p, supportedIdeas: toggleItem(p.supportedIdeas, action.ideaId) };
    case 'dismissUpdate':
      return { ...p, dismissedUpdates: [...new Set([...p.dismissedUpdates, action.updateId])] };
    default:
      return p;
  }
}

function updateActiveProfile(state, updater) {
  const id = state.activeProfileId;
  return { ...state, profileState: { ...state.profileState, [id]: updater(state.profileState[id]) } };
}

/** Reducer für den DEMO-Modus (Verhalten unverändert). */
function reducer(state, action) {
  switch (action.type) {
    case 'switchProfile':
      return state.profileState[action.profileId] ? { ...state, activeProfileId: action.profileId } : state;

    case 'setRegistration':
    case 'toggleInterest':
    case 'toggleIdeaSupport':
    case 'dismissUpdate':
      return updateActiveProfile(state, (p) => applyPersonalAction(p, action));

    case 'addIdea': {
      const author = getDemoProfile(state.activeProfileId);
      const idea = {
        ...action.idea,
        authorId: author.id,
        schoolId: author.schoolId,
        status: 'submitted',
        isLocal: true,
      };
      return { ...state, customIdeas: [idea, ...state.customIdeas] };
    }

    case 'deleteIdea':
      return {
        ...state,
        customIdeas: state.customIdeas.filter(
          (idea) => !(idea.id === action.ideaId && idea.authorId === state.activeProfileId),
        ),
      };

    case 'reset':
      return { ...createInitialState(), activeProfileId: state.activeProfileId };

    default:
      return state;
  }
}

/**
 * Reducer für die lokal gespeicherten Daten des ECHTEN Kontos
 * (nur noch Projekt-Interesse und ausgeblendete Hinweise – alles andere liegt in Supabase).
 */
function accountReducer(data, action) {
  return applyPersonalAction(data, action);
}

function loadAccountData(userId) {
  try {
    return sanitizeAccountData(JSON.parse(localStorage.getItem(ACCOUNT_STORAGE_PREFIX + userId)));
  } catch {
    return emptyAccountData();
  }
}

const newIdeaId = () => `local-${Date.now().toString(36)}`;

const AppStateContext = createContext(null);

export function AppStateProvider({ children }) {
  const auth = useAuth();
  const [state, dispatch] = useReducer(reducer, undefined, loadState);
  const [account, setAccount] = useState({ userId: null, data: null });
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), ARCHIVE_TICK_MS);
    return () => clearInterval(id);
  }, []);

  // Demo-Daten speichern (wie bisher)
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Speicher nicht verfügbar – Demo funktioniert weiter, aber ohne Speicherung
    }
  }, [state]);

  // Lokale Daten des angemeldeten Kontos laden – direkt beim Rendern, sobald sich
  // das Konto ändert (React-Muster "State beim Rendern anpassen", kein extra Ladeschritt) ...
  const authUserId = auth.user?.id ?? null;
  if (authUserId && account.userId !== authUserId) {
    setAccount({ userId: authUserId, data: loadAccountData(authUserId) });
  }

  // ... und speichern (eigener Schlüssel pro Konto, getrennt von der Demo)
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

  /** 'demo' | 'loading' | 'error' | 'account' */
  let mode = 'demo';
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

  const actions = useMemo(() => {
    // Persönliche Aktionen gehen je nach Modus an die Demo ODER an das Konto – nie an beide.
    const personal = (action) => (isAccount ? dispatchAccount(action) : dispatch(action));
    return {
      switchProfile: (profileId) => {
        if (!isAccount) dispatch({ type: 'switchProfile', profileId });
      },
      // Konto: direkt in Supabase (event_registrations). Demo: wie bisher im Browser.
      // Gibt ein Promise<boolean> zurück: true = gespeichert (Konto: von Supabase bestätigt).
      setRegistration: async (eventId, status) => {
        if (isAccount) return saveAccountRegistration(eventId, status);
        dispatch({ type: 'setRegistration', eventId, status });
        return true;
      },
      toggleInterest: (topic) => {
        if (isAccount) updateInterests(toggleItem(accountInterests, topic));
        else dispatch({ type: 'toggleInterest', topic });
      },
      // Konto: direkt in Supabase (idea_supports). Demo: wie bisher im Browser.
      toggleIdeaSupport: (ideaId) => {
        if (isAccount) toggleAccountSupport(ideaId);
        else dispatch({ type: 'toggleIdeaSupport', ideaId });
      },
      dismissUpdate: (updateId) => personal({ type: 'dismissUpdate', updateId }),
      /**
       * Speichert eine neue Idee. Gibt in BEIDEN Modi ein Promise zurück:
       * { id } bei Erfolg oder { errorKey } bei einem Fehler.
       */
      addIdea: async (idea) => {
        if (isAccount) return createAccountIdea(idea, accountSchoolId);
        const id = newIdeaId();
        dispatch({ type: 'addIdea', idea: { ...idea, id, createdAt: new Date().toISOString() } });
        return { id };
      },
      /** Löscht eine eigene Idee. Promise mit {} oder { errorKey }. */
      deleteIdea: async (ideaId) => {
        if (isAccount) return deleteAccountIdea(ideaId);
        dispatch({ type: 'deleteIdea', ideaId });
        return {};
      },
      /** Setzt NUR die Demo-Daten zurück – nie das echte Konto. */
      resetDemo: () => dispatch({ type: 'reset' }),
    };
  }, [
    isAccount,
    dispatchAccount,
    updateInterests,
    saveAccountRegistration,
    accountInterests,
    accountSchoolId,
    toggleAccountSupport,
    createAccountIdea,
    deleteAccountIdea,
  ]);

  const value = useMemo(() => {
    if (mode === 'account') {
      // Archivierte Events (24 h nach Ende; abgesagt: nach Ende UND Absage) für Schüler:innen überall ausblenden –
      // Listen, "Meine", Startseite, Schulen, Empfehlungen UND Detailseite (getEvent).
      // Anmeldungen bleiben unverändert in accountEvents.registrations.
      const events = visibleToStudents(accountEvents.events, now);
      return {
        mode,
        isRealAccount: true,
        user: buildAccountUser(
          auth.user.id,
          auth.profile,
          account.data,
          accountEvents.registrations,
          accountIdeas.supported,
        ),
        events,
        getEvent: (id) => events.find((event) => event.id === id),
        /** Speicherzustand der echten Anmeldungen (für die Event-Detailseite) */
        registrationSync: { pending: accountEvents.pending, error: accountEvents.saveError },
        // NUR echte Ideen aus Supabase – keine Demo-Ideen, keine alten Browser-Ideen.
        ideas: accountIdeas.ideas,
        // Zahlen aus der Datenbank-Funktion get_idea_support_counts()
        supportCounts: accountIdeas.counts,
        /** Speicherzustand der echten Unterstützungen */
        ideaSync: { pending: accountIdeas.pending, error: accountIdeas.saveError },
        actions,
      };
    }
    const profile = getDemoProfile(state.activeProfileId);
    const user = { ...profile, ...state.profileState[profile.id], school: getSchool(profile.schoolId) };
    return {
      mode,
      isRealAccount: false,
      user,
      events: demoEvents,
      getEvent: (id) => demoEvents.find((event) => event.id === id),
      registrationSync: { pending: {}, error: null },
      ideas: [...state.customIdeas, ...seedIdeas],
      supportCounts: getSupportCounts(state.profileState),
      ideaSync: { pending: {}, error: null },
      actions,
    };
  }, [
    mode,
    now,
    auth.user,
    auth.profile,
    account,
    state,
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
