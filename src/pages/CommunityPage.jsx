import { Link } from 'react-router';
import { useI18n } from '../i18n/LanguageContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import Icon from '../components/Icon.jsx';

/**
 * Bereich „Community“ (Struktur aus der Codex-Version).
 *
 * Schülerprofile (Stufe 5, Migration 012) und Projekt-/Eventgruppen (Chat-Räume aus Migration 014,
 * Seite /community/groups) sind angeschlossen. Kerems Spiele („Spiele“, /games) und der Chatroom
 * („Chatroom“, /chat) haben eigene Hauptbereiche in der Navigation.
 */
export default function CommunityPage() {
  const { t } = useI18n();
  return (
    <div className="page">
      <PageHeader title={t('community.title')} subtitle={t('community.subtitle')} />

      <div className="hub-grid">
        <Link to="/tutoring" className="hub-card">
          <span className="hub-card__icon" aria-hidden="true">
            <Icon name="lightbulb" size={24} />
          </span>
          <span className="hub-card__body">
            <span className="hub-card__title">{t('nav.tutoring')}</span>
            <span className="hub-card__text">{t('community.tutoringText')}</span>
          </span>
          <Icon name="chevronRight" size={18} />
        </Link>
        <Link to="/community/people" className="hub-card">
          <span className="hub-card__icon" aria-hidden="true">
            <Icon name="users" size={24} />
          </span>
          <span className="hub-card__body">
            <span className="hub-card__title">{t('profiles.peopleTitle')}</span>
            <span className="hub-card__text">{t('community.peopleText')}</span>
          </span>
          <Icon name="chevronRight" size={18} />
        </Link>
        <Link to="/community/groups" className="hub-card">
          <span className="hub-card__icon" aria-hidden="true">
            <Icon name="chat" size={24} />
          </span>
          <span className="hub-card__body">
            <span className="hub-card__title">{t('community.groups.title')}</span>
            <span className="hub-card__text">{t('community.groupsText')}</span>
          </span>
          <Icon name="chevronRight" size={18} />
        </Link>
      </div>
    </div>
  );
}
