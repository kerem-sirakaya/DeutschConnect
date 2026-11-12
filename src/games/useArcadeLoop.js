import { useEffect, useRef, useState } from 'react';
import { advance } from './arcadeStep.js';

/**
 * Game Loop für Reaktionsspiele (Papierflug, Brückenläufer).
 *
 * Urheber: Kerem – Ablauf aus der Codex-Version (Branch `codex-version-1.0`,
 * `src/games/ArcadeGame.jsx`): `requestAnimationFrame` berechnet mit
 * `step(zustand, sekunden, eingabe)` den nächsten Zustand. Für DeutschConnect als Hook
 * herausgelöst, ohne Ergebnis-Speicherung und ohne Bestwert.
 *
 * LEISTUNG (warum es so gebaut ist):
 * - Der Spielzustand liegt in einem `useRef`, NICHT im React-State. Pro Bild wird deshalb
 *   kein React-Render ausgelöst; gezeichnet wird über `onFrame` direkt (Canvas).
 * - React-State ändert sich nur beim Phasenwechsel (Start, Pause, Ende).
 * - Punkte werden über `onScore` nur gemeldet, wenn sie sich ändern.
 * - Langsame Geräte: Statt den Zeitschritt zu kappen (→ Zeitlupe), wird die vergangene Zeit in
 *   Teilschritten von 1/60 s nachgerechnet (`advance` in arcadeStep.js). Die Regeln in `step`
 *   bleiben unverändert.
 *
 * Phasen: 'ready' (noch nicht gestartet) → 'playing' → 'paused' / 'over'.
 * Automatische Pause, wenn der Tab gewechselt wird oder das Fenster den Fokus verliert.
 *
 * @param fresh    () => Startzustand
 * @param step     (zustand, sekunden, eingabe) => neuer Zustand (mit `over: true` am Ende)
 * @param onFrame      (zustand) => void – zeichnet ein Bild
 * @param onScore      (punkte) => void – nur bei Änderung
 * @param onRoundStart () => void – eine NEUE Runde beginnt (nicht beim Fortsetzen nach Pause)
 * @param onRoundEnd   (punkte) => void – Runde vorbei (für die Bestenliste, Migration 017)
 * Die beiden Runden-Rückmeldungen ändern nichts am Spielablauf.
 */
export function useArcadeLoop(fresh, step, { onFrame, onScore, onRoundStart, onRoundEnd } = {}) {
  const [phase, setPhase] = useState('ready');
  const [finalScore, setFinalScore] = useState(0);
  const scene = useRef(null);
  if (scene.current === null) scene.current = fresh();
  const input = useRef(false); // wurde seit dem letzten Bild getippt?
  const callbacks = useRef({});
  callbacks.current = { onFrame, onScore, onRoundStart, onRoundEnd };

  useEffect(() => {
    if (phase !== 'playing') return undefined;
    let frame;
    let last;
    let shownScore = scene.current.score;

    const tick = (time) => {
      if (last === undefined) last = time;
      const next = advance(scene.current, (time - last) / 1000, input.current, step);
      last = time;
      input.current = false;
      scene.current = next;

      callbacks.current.onFrame?.(next);
      if (next.score !== shownScore) {
        shownScore = next.score;
        callbacks.current.onScore?.(next.score);
      }
      if (next.over) {
        setFinalScore(next.score);
        setPhase('over');
        callbacks.current.onRoundEnd?.(next.score);
      } else {
        frame = requestAnimationFrame(tick);
      }
    };

    const pauseIfHidden = () => {
      if (document.hidden && !scene.current.over) setPhase('paused');
    };
    const pauseOnBlur = () => {
      if (!scene.current.over) setPhase('paused');
    };
    frame = requestAnimationFrame(tick);
    document.addEventListener('visibilitychange', pauseIfHidden);
    window.addEventListener('blur', pauseOnBlur);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', pauseIfHidden);
      window.removeEventListener('blur', pauseOnBlur);
    };
  }, [phase, step]);

  /** Starten bzw. fortsetzen; `reset` (oder nach Spielende) beginnt eine neue Runde. */
  function start(reset = false) {
    if (reset || phase === 'over' || phase === 'ready') {
      scene.current = fresh();
      callbacks.current.onFrame?.(scene.current);
      callbacks.current.onScore?.(scene.current.score);
      callbacks.current.onRoundStart?.();
    }
    input.current = false;
    setPhase('playing');
  }

  /** Tippen / Leertaste: startet das Spiel oder gibt eine Eingabe (Auftrieb/Sprung). */
  function act() {
    if (phase === 'ready' || phase === 'over') start(true);
    else if (phase === 'playing') input.current = true;
    else if (phase === 'paused') start();
  }

  const pause = () => setPhase('paused');

  return { phase, finalScore, scene, start, act, pause };
}
