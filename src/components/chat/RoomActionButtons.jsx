import { Link } from 'react-router';
import { useI18n } from '../../i18n/LanguageContext.jsx';
import { roomActions } from '../../lib/chat.js';

/**
 * Knöpfe eines Raums (Übersicht /chat und Raumseite):
 *   kein Mitglied: „Beitreten“ · Mitglied: „Raum betreten“ + „Verlassen“.
 * onToggle = beitreten bzw. verlassen. „Raum betreten“ ist ein Link (auf der Raumseite ausgeblendet: showEnter=false).
 * Nur Anzeige – Lesen/Schreiben prüft die Datenbank (014, DC042).
 */
export default function RoomActionButtons({ room, busy, onToggle, showEnter = true }) {
  const { t } = useI18n();
  const actions = roomActions(room).filter((a) => showEnter || a !== 'enter');
  if (!actions.length) return null;
  return (
    <div className="chat-room-actions">
      {actions.includes('join') && (
        <button type="button" className="btn btn--primary btn--sm" disabled={busy} onClick={onToggle}>
          {t('chat.join')}
        </button>
      )}
      {actions.includes('enter') && (
        <Link to={`/chat/rooms/${room.id}`} className="btn btn--primary btn--sm">
          {t('chat.enter')}
        </Link>
      )}
      {actions.includes('leave') && (
        <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={onToggle}>
          {t('chat.leave')}
        </button>
      )}
    </div>
  );
}
