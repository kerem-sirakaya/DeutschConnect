import { useEffect, useRef } from 'react';
import { useI18n } from '../i18n/LanguageContext.jsx';
import { useArcadeLoop } from './useArcadeLoop.js';
import { ARCADE_FIELD, arcadeViewport, readArcadeColors, drawBackground } from './arcadeCanvas.js';

/** Höchste Pixeldichte für das Canvas: 3× (viele Handys) kostet viel Rechenzeit, 2× sieht gleich scharf aus. */
const MAX_PIXEL_RATIO = 2;

/**
 * Gemeinsame Hülle für Reaktionsspiele (Papierflug, Brückenläufer):
 * Punkte, Spielfeld, Knöpfe Starten/Pause/Fortsetzen/Neu starten, Status-Meldung.
 * Jedes Spiel liefert nur seine Regeln (`fresh`, `step`) und seine Zeichnung (`drawScene`).
 *
 * Urheber: Kerem – Aufbau aus der Codex-Version (Branch `codex-version-1.0`,
 * `src/games/ArcadeGame.jsx`; dort ebenfalls eine gemeinsame Komponente für beide Spiele).
 * Für DeutschConnect angepasst: unsere Übersetzungen, CSS-Klassen und Farbvariablen,
 * Game Loop im Hook `useArcadeLoop`, keine Bestenliste, KEIN gespeicherter Bestwert –
 * es werden nur die Punkte der aktuellen Runde gezeigt.
 *
 * LEISTUNG: Gezeichnet wird auf ein <canvas> (vorher SVG), direkt aus der Game Loop.
 * React rendert diese Komponente nur bei Phasenwechseln, nicht in jedem Bild.
 * Die Punkte werden direkt in das <span> geschrieben, nur wenn sie sich ändern.
 *
 * Bedienung: Spielfeld antippen/anklicken, Leertaste, Pfeil nach oben oder Enter.
 */
export default function ArcadeGame({
  titleId,
  title,
  hint,
  fieldLabel,
  accessibility,
  fresh,
  step,
  drawScene,
  resizeScene,
  onRoundStart,
  onRoundEnd,
}) {
  const { t } = useI18n();
  const field = useRef(null);
  const canvas = useRef(null);
  const context = useRef(null);
  const colors = useRef(null);
  const scoreText = useRef(null);
  const viewport = useRef(ARCADE_FIELD);
  const tRef = useRef(t);
  tRef.current = t;

  function paint(scene) {
    const ctx = context.current;
    if (!ctx || !colors.current) return;
    drawBackground(ctx, colors.current, viewport.current);
    drawScene(ctx, scene, colors.current, viewport.current);
  }

  function showScore(score) {
    if (scoreText.current) scoreText.current.textContent = tRef.current('games.arcade.score', { count: score });
  }

  const { phase, finalScore, scene, start, act, pause } = useArcadeLoop(() => fresh(viewport.current.height), step, {
    onFrame: paint,
    onScore: showScore,
    onRoundStart, // optional: Bestenliste (Migration 017)
    onRoundEnd,
  });

  // Canvas an die angezeigte Größe anpassen (scharf auf Handys), Farben aus CSS lesen, neu zeichnen.
  useEffect(() => {
    const element = canvas.current;
    if (!element) return undefined;
    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
      const width = Math.max(1, Math.round(element.clientWidth * ratio));
      const height = Math.max(1, Math.round(element.clientHeight * ratio));
      viewport.current = arcadeViewport(
        element.clientWidth,
        element.clientHeight,
        window.matchMedia('(max-width: 599px) and (orientation: portrait)').matches,
      );
      if (resizeScene) scene.current = resizeScene(scene.current, viewport.current.height);
      if (element.width !== width || element.height !== height) {
        element.width = width;
        element.height = height;
      }
      const ctx = element.getContext('2d');
      // Darstellung und Kollisionen verwenden dieselbe Welt, ohne Figuren zu strecken.
      ctx.setTransform(width / viewport.current.width, 0, 0, height / viewport.current.height, 0, 0);
      context.current = ctx;
      colors.current = readArcadeColors(element);
      paint(scene.current);
    };
    resize();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', resize);
      return () => window.removeEventListener('resize', resize);
    }
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => observer.disconnect();
    // paint/scene sind über Refs aktuell; nur einmal beim Einbauen einrichten.
  }, []);

  // Punkte-Text bei Sprachwechsel aktualisieren.
  useEffect(() => {
    showScore(scene.current.score);
  }, [t]);

  // Nach jedem Start den Fokus aufs Spielfeld setzen: Sonst läge er auf dem Knopf „Starten“
  // und die Leertaste würde den Knopf erneut drücken (= Pause) statt zu springen/fliegen.
  const focusField = () => field.current?.focus({ preventScroll: true });

  function handleAct() {
    act();
    focusField();
  }

  function handleStart(reset = false) {
    start(reset);
    focusField();
  }

  const overlay =
    phase === 'over' ? t('games.arcade.over') : phase === 'paused' ? t('games.arcade.paused') : t('games.arcade.tapToStart');
  let status = '';
  if (phase === 'over') status = t('games.arcade.result', { count: finalScore });
  else if (phase === 'paused') status = t('games.arcade.paused');

  return (
    <section className="card stack arcade-game" aria-labelledby={titleId}>
      <h2 id={titleId} className="visually-hidden">
        {title}
      </h2>
      <p className="muted arcade-hint">{hint}</p>

      <div className="game-score">
        {/* Inhalt wird direkt von showScore() gesetzt, nicht von React */}
        <span ref={scoreText} />
      </div>

      <button
        ref={field}
        type="button"
        className="arcade-field"
        aria-label={fieldLabel}
        onPointerDown={(event) => {
          if (!event.isPrimary || event.button !== 0) return;
          event.preventDefault();
          handleAct();
        }}
        onKeyDown={(event) => {
          if (['Space', 'ArrowUp', 'Enter'].includes(event.code) || event.key === ' ') {
            event.preventDefault(); // Seite soll nicht scrollen
            if (!event.repeat) handleAct();
          }
        }}
      >
        <canvas ref={canvas} className="arcade-canvas" aria-hidden="true" />
        {phase !== 'playing' && (
          <span className="arcade-overlay" aria-hidden="true">
            {overlay}
          </span>
        )}
      </button>

      <div className="arcade-actions">
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => (phase === 'playing' ? pause() : handleStart())}
        >
          {phase === 'playing'
            ? t('games.arcade.pause')
            : phase === 'paused'
              ? t('games.arcade.resume')
              : t('games.arcade.start')}
        </button>
        <button type="button" className="btn btn--secondary" onClick={() => handleStart(true)}>
          {t('games.restart')}
        </button>
      </div>

      <p role="status" className="game-status">
        {status}
      </p>
      <p className="muted arcade-accessibility">{accessibility}</p>
    </section>
  );
}
