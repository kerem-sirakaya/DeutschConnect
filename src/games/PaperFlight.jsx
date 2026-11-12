import { useI18n } from '../i18n/LanguageContext.jsx';
import ArcadeGame from './ArcadeGame.jsx';
import { fillRoundRect } from './arcadeCanvas.js';
import { FIELD, PLANE_X, PIPE_WIDTH, GAP_HALF, freshFlight, stepFlight } from './paperFlight.js';

/**
 * Spiel „Papierflug“ – läuft komplett im Browser.
 *
 * Urheber: Kerem – Spielidee, Regeln und Zeichnung stammen aus der Codex-Version
 * (Branch `codex-version-1.0`, `src/games/ArcadeGame.jsx` + `arcade.js`).
 * Für DeutschConnect angepasst: Hülle (Knöpfe, Punkte, Status) in `ArcadeGame.jsx`,
 * Kerems SVG-Formen als Canvas-Zeichnung (schneller, siehe arcadeCanvas.js),
 * keine Bestenliste, KEIN gespeicherter Bestwert.
 */
function drawFlight(ctx, scene, colors) {
  // Säulen (SVG: zwei <rect rx="5"> pro Säule)
  ctx.fillStyle = colors.primary;
  for (const pipe of scene.pipes) {
    fillRoundRect(ctx, pipe.x, 0, PIPE_WIDTH, pipe.gap - GAP_HALF, 5);
    fillRoundRect(ctx, pipe.x, pipe.gap + GAP_HALF, PIPE_WIDTH, FIELD.height - pipe.gap - GAP_HALF, 5);
  }

  // Flugzeug (SVG-Pfad: Spitze nach rechts, Kerbe hinten)
  const y = scene.y;
  ctx.beginPath();
  ctx.moveTo(PLANE_X, y - 10);
  ctx.lineTo(PLANE_X + 36, y);
  ctx.lineTo(PLANE_X, y + 10);
  ctx.lineTo(PLANE_X + 8, y);
  ctx.closePath();
  ctx.fillStyle = colors.text;
  ctx.fill();
  ctx.strokeStyle = colors.primaryText;
  ctx.lineWidth = 2;
  ctx.stroke();
}

/** onRoundStart/onRoundEnd: optional für die Bestenliste (siehe useGameLeaderboard). */
export default function PaperFlight({ onRoundStart, onRoundEnd }) {
  const { t } = useI18n();
  return (
    <ArcadeGame
      titleId="paper-flight-title"
      title={t('games.paperFlight.title')}
      hint={t('games.paperFlight.hint')}
      fieldLabel={t('games.paperFlight.field')}
      accessibility={t('games.paperFlight.accessibility')}
      fresh={freshFlight}
      step={stepFlight}
      drawScene={drawFlight}
      onRoundStart={onRoundStart}
      onRoundEnd={onRoundEnd}
    />
  );
}
