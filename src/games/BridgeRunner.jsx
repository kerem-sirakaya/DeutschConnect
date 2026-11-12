import { useI18n } from '../i18n/LanguageContext.jsx';
import ArcadeGame from './ArcadeGame.jsx';
import { ARCADE_FIELD, fillRoundRect } from './arcadeCanvas.js';
import { GROUND_Y, RUNNER_X, RUNNER_SIZE, freshRunner, stepRunner } from './bridgeRunner.js';

/**
 * Spiel „Brückenläufer“ – läuft komplett im Browser.
 *
 * Urheber: Kerem – Spielidee, Regeln und Zeichnung (Brücke, Hindernisse, Spielfigur)
 * stammen aus der Codex-Version (Branch `codex-version-1.0`, `src/games/ArcadeGame.jsx` + `arcade.js`).
 * Für DeutschConnect angepasst: Hülle (Knöpfe, Punkte, Status) in `ArcadeGame.jsx`,
 * Kerems SVG-Formen als Canvas-Zeichnung (schneller, siehe arcadeCanvas.js),
 * keine Bestenliste, KEIN gespeicherter Bestwert.
 */
function drawRunner(ctx, scene, colors) {
  // Brücke (SVG: M0 270 H640, Strichstärke 3)
  ctx.strokeStyle = colors.primaryText;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, GROUND_Y);
  ctx.lineTo(ARCADE_FIELD.width, GROUND_Y);
  ctx.stroke();

  // Hindernisse (SVG: <rect rx="6">)
  ctx.fillStyle = colors.primaryText;
  for (const obstacle of scene.obstacles) {
    fillRoundRect(ctx, obstacle.x, GROUND_Y - obstacle.height, obstacle.width, obstacle.height, 6);
  }

  // Spielfigur: steht auf der Brücke und wird beim Springen um `y` angehoben.
  const left = RUNNER_X - 1;
  const top = GROUND_Y - RUNNER_SIZE - scene.y;
  ctx.fillStyle = colors.primary;
  fillRoundRect(ctx, left, top, RUNNER_SIZE, RUNNER_SIZE, 9);
  // Gesicht (SVG: M8 12H12 M21 12H25 M10 24H23)
  ctx.strokeStyle = colors.text;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(left + 8, top + 12);
  ctx.lineTo(left + 12, top + 12);
  ctx.moveTo(left + 21, top + 12);
  ctx.lineTo(left + 25, top + 12);
  ctx.moveTo(left + 10, top + 24);
  ctx.lineTo(left + 23, top + 24);
  ctx.stroke();
}

/** onRoundStart/onRoundEnd: optional für die Bestenliste (siehe useGameLeaderboard). */
export default function BridgeRunner({ onRoundStart, onRoundEnd }) {
  const { t } = useI18n();
  return (
    <ArcadeGame
      titleId="bridge-runner-title"
      title={t('games.bridgeRunner.title')}
      hint={t('games.bridgeRunner.hint')}
      fieldLabel={t('games.bridgeRunner.field')}
      accessibility={t('games.bridgeRunner.accessibility')}
      fresh={freshRunner}
      step={stepRunner}
      drawScene={drawRunner}
      onRoundStart={onRoundStart}
      onRoundEnd={onRoundEnd}
    />
  );
}
