import { useState } from 'react';
import { Link } from 'react-router';
import { useI18n } from '../i18n/LanguageContext.jsx';
import { useAppState } from '../state/AppStateContext.jsx';
import { isUpcoming } from '../lib/selectors.js';
import PageHeader from '../components/PageHeader.jsx';
import SectionNav from '../components/SectionNav.jsx';
import Icon from '../components/Icon.jsx';

/**
 * Bereich „Entdecken“ (Struktur aus der Codex-Version): Einstieg zu Events und Ideen/Projekten. Die Zahlen kommen aus denselben Daten wie die Unterseiten
 * (angemeldet: Supabase, abgemeldet: Demo).
 */
export default function DiscoverPage() {
  const { t } = useI18n();
  const { events, ideas, isRealAccount } = useAppState();
  const [now] = useState(() => new Date());
  const upcoming = events.filter((event) => isUpcoming(event, now)).length;

  const cards = [
    { to: '/events?tab=all', icon: 'calendar', title: t('nav.events'), text: t('discover.eventsText'), count: upcoming, countLabel: t('discover.upcomingCount', { count: upcoming }) },
    { to: '/ideas?tab=all', icon: 'lightbulb', title: t('nav.ideas'), text: t('discover.ideasText'), count: ideas.length, countLabel: t('discover.ideasCount', { count: ideas.length }) },
  ];

  return (
    <div className="page">
      <PageHeader title={t('discover.title')} subtitle={t('discover.subtitle')} />
      <SectionNav section="discover" />
      <div className="hub-grid">
        {cards.map((card) => (
          <Link key={card.to} to={card.to} className="hub-card">
            <span className="hub-card__icon" aria-hidden="true">
              <Icon name={card.icon} size={24} />
            </span>
            <span className="hub-card__body">
              <span className="hub-card__title">{card.title}</span>
              <span className="hub-card__text">{card.text}</span>
              <span className="hub-card__meta">{card.countLabel}</span>
            </span>
            <Icon name="chevronRight" size={18} />
          </Link>
        ))}
      </div>
      {!isRealAccount && <p className="module-note">{t('discover.demoHint')}</p>}
    </div>
  );
}
