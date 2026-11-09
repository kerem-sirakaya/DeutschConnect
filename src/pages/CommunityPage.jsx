import { Link } from 'react-router';
import { useI18n } from '../i18n/LanguageContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import Icon from '../components/Icon.jsx';

/**
 * Bereich „Community“ (Struktur aus der Codex-Version).
 *
 * EHRLICHER STAND: Schülerprofile sind angeschlossen (Stufe 5, Migration 012). Gruppen und
 * Spiele aus der Codex-Version sind noch NICHT an das Supabase-Backend angeschlossen (Stufen 6 und 8 in
 * docs/INTEGRATION_PROGRESS.md). Deshalb zeigt diese Seite dafür bewusst keine Knöpfe,
 * die nur so tun, als ob – nur Links zu Funktionen, die wirklich funktionieren.
 */
// Gruppenbeiträge bleiben für den Pilot bewusst AUS (Entscheidung Ege, 2026-11-09).
const PLANNED = ['groups', 'games'];

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
        <Link to="/network" className="hub-card">
          <span className="hub-card__icon" aria-hidden="true">
            <Icon name="network" size={24} />
          </span>
          <span className="hub-card__body">
            <span className="hub-card__title">{t('nav.network')}</span>
            <span className="hub-card__text">{t('community.networkText')}</span>
          </span>
          <Icon name="chevronRight" size={18} />
        </Link>
      </div>

      <section className="card stack" aria-labelledby="community-planned">
        <h2 id="community-planned">{t('community.plannedTitle')}</h2>
        <p className="muted">{t('community.plannedText')}</p>
        <ul className="planned-list">
          {PLANNED.map((id) => (
            <li key={id}>
              <span className="status-chip">{t('community.inIntegration')}</span>
              <span>{t(`community.planned.${id}`)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
