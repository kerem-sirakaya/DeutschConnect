import { Link } from 'react-router';
import { useI18n } from '../i18n/LanguageContext.jsx';
import Icon from './Icon.jsx';

const ACTIONS = [
  { to: '/events?tab=all', icon: 'search', key: 'quick.discover' },
  { to: '/events?tab=mine', icon: 'calendar', key: 'quick.myEvents' },
  { to: '/ideas/new', icon: 'plus', key: 'quick.newIdea', primary: true },
  { to: '/network', icon: 'network', key: 'quick.schools' },
];

export default function QuickActions() {
  const { t } = useI18n();
  return (
    <nav className="quick-actions" aria-label={t('home.quickActionsLabel')}>
      {ACTIONS.map((action) => (
        <Link key={action.to} to={action.to} className={`quick-action${action.primary ? ' quick-action--primary' : ''}`}>
          <span className="quick-action__icon">
            <Icon name={action.icon} size={20} />
          </span>
          <span className="quick-action__label">{t(action.key)}</span>
        </Link>
      ))}
    </nav>
  );
}
