import { useCallback, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';
import { useAppState } from './AppStateContext.jsx';
import { useRemote } from './useRemote.js';
import { leaderboardErrorKey, rejectedSubmitKey, shouldSubmit } from '../lib/leaderboard.js';
import {
  fetchLeaderboard,
  fetchMyStatus,
  setLeaderboardVisibility,
  startRun,
  submitScore,
} from '../lib/leaderboardApi.js';

/**
 * Bestenliste für ein Reaktionsspiel (Migration 017).
 *
 * Spielseite (nur einreichen, Top 10 nicht laden):
 *   const lb = useGameLeaderboard('paper_flight', { loadBoard: false });
 *   <PaperFlight onRoundStart={lb.roundStarted} onRoundEnd={lb.roundEnded} />
 *   <LeaderboardSaveStatus leaderboard={lb} />
 * Spiele-Übersicht /games (anzeigen): siehe src/games/GameLeaderboards.jsx
 *
 * - Nicht angemeldet (Gast): nichts wird geladen oder gespeichert; status = 'guest'.
 * - roundStarted(): Der Server merkt sich die Startzeit der Runde (Schutz vor erfundenen Punkten).
 * - roundEnded(score): Nur ein HÖHERER Wert als der bekannte Bestwert wird eingereicht;
 *   danach werden Liste und eigener Stand neu geladen.
 * - Das Spiel selbst (Mechanik, Steuerung) bleibt davon völlig unberührt; Fehler hier
 *   unterbrechen nie das Spielen.
 */
export function useGameLeaderboard(game, { loadBoard = true } = {}) {
  const { mode, user } = useAppState();
  const isAccount = mode === 'account' && Boolean(supabase);
  // loadBoard = false (Spielseiten): Top 10 nicht laden – angezeigt werden sie nur auf /games.
  // Der eigene Stand (me) wird immer geladen: Er entscheidet, ob ein Ergebnis eingereicht wird.
  const board = useRemote(
    (client) => (loadBoard ? fetchLeaderboard(client, game) : Promise.resolve([])),
    () => null,
    [user.id, game, loadBoard],
    leaderboardErrorKey,
  );
  const me = useRemote((client) => fetchMyStatus(client, game), () => null, [user.id, game], leaderboardErrorKey);
  const { reload: reloadBoard } = board;
  const { reload: reloadMe } = me;

  const run = useRef(null); // Promise<boolean>: wurde der Rundenstart vom Server bestätigt?
  const best = useRef(null);
  best.current = me.status === 'ready' ? me.data?.bestScore ?? null : null;
  const installed = me.status === 'ready';

  const [save, setSave] = useState({ status: 'idle', score: null, errorKey: null });
  const [visibility, setVisibility] = useState({ busy: false, errorKey: null });

  const roundStarted = useCallback(() => {
    setSave({ status: 'idle', score: null, errorKey: null }); // Meldung der letzten Runde ausblenden
    if (!isAccount || !installed) {
      run.current = null;
      return;
    }
    run.current = startRun(supabase, game).then(
      () => true,
      () => false,
    );
  }, [isAccount, installed, game]);

  const roundEnded = useCallback(
    async (score) => {
      const pending = run.current;
      run.current = null;
      if (!isAccount || !pending || !shouldSubmit(score, best.current)) return;
      setSave({ status: 'saving', score, errorKey: null });
      if (!(await pending)) {
        setSave({ status: 'error', score, errorKey: 'games.leaderboard.errors.generic' });
        return;
      }
      try {
        const result = await submitScore(supabase, game, score);
        const rejected = rejectedSubmitKey(result.status);
        if (rejected) {
          // Abgelehnt (nicht plausibel / abgelaufen): Runde ist in der Datenbank verbraucht, nichts gespeichert.
          setSave({ status: 'error', score, errorKey: rejected });
          return;
        }
        setSave({ status: result.isNewBest ? 'newBest' : 'kept', score: result.bestScore, errorKey: null });
        reloadMe();
        if (result.isNewBest) reloadBoard();
      } catch (error) {
        setSave({ status: 'error', score, errorKey: leaderboardErrorKey(error) });
      }
    },
    [isAccount, game, reloadBoard, reloadMe],
  );

  /** Anzeige an/aus (gilt für beide Spiele). Gibt true zurück, wenn die Datenbank es bestätigt hat. */
  const changeVisibility = useCallback(
    async (visible) => {
      if (!isAccount) return false;
      setVisibility({ busy: true, errorKey: null });
      try {
        await setLeaderboardVisibility(supabase, visible);
        setVisibility({ busy: false, errorKey: null });
        reloadMe();
        reloadBoard();
        return true;
      } catch (error) {
        setVisibility({ busy: false, errorKey: leaderboardErrorKey(error) });
        return false;
      }
    },
    [isAccount, reloadBoard, reloadMe],
  );

  return { game, board, me, save, visibility, roundStarted, roundEnded, changeVisibility };
}
