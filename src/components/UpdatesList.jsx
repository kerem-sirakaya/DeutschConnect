import { Link } from 'react-router';
import { useI18n } from '../i18n/LanguageContext.jsx';
import { localize } from '../i18n/localize.js';
import { useAppState } from '../state/AppStateContext.jsx';
import { getSchool } from '../data/schools.js';
import { formatRelativeDays } from '../lib/format.js';
import Icon from './Icon.jsx';

const ICONS = { invitation: 'mail', reminder: 'bell', ideaReview: 'lightbulb' };

/** Persönliche Hinweise: Einladungen, Erinnerungen, Status eigener Ideen. */
export default function UpdatesList({ updates }) {
  const { t, language, locale } = useI18n();
  const { actions } = useAppState();

  const textFor = (update) => {
    switch (update.type) {
      case 'invitation':
        return t('updates.invitation', {
          school: getSchool(update.fromSchoolId)?.shortName ?? '',
          event: localize(update.event.title, language),
        });
      case 'reminder': {
        const when = formatRelativeDays(update.days, locale);
        return t('updates.reminder', {
          when: when.charAt(0).toLocaleUpperCase(locale) + when.slice(1),
          event: localize(update.event.title, language),
        });
      }
      case 'ideaReview':
        return t('updates.ideaReview', { idea: localize(update.idea.title, language) });
      default:
        return '';
    }
  };

  const linkFor = (update) => (update.event ? `/events/${update.event.id}` : `/ideas/${update.idea.id}`);

  return (
    <ul className="updates">
      {updates.map((update) => (
        <li key={update.id} className={`update update--${update.type}`}>
          <span className="update__icon">
            <Icon name={ICONS[update.type]} size={18} />
          </span>
          <div className="update__body">
            <p className="update__text">{textFor(update)}</p>
            <div className="update__actions">
              {update.type === 'invitation' && (
                <button
                  type="button"
                  className="btn btn--primary btn--xs"
                  onClick={() => actions.setRegistration(update.event.id, 'interested')}
                >
                  {t('eventDetail.markInterest')}
                </button>
              )}
              <Link to={linkFor(update)} className="btn btn--secondary btn--xs">
                {t('updates.view')}
              </Link>
            </div>
          </div>
          <button
            type="button"
            className="icon-button update__dismiss"
            onClick={() => actions.dismissUpdate(update.id)}
            aria-label={t('updates.dismiss')}
            title={t('updates.dismiss')}
          >
            <Icon name="close" size={16} />
          </button>
        </li>
      ))}
    </ul>
  );
}
