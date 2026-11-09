import { useI18n } from '../../i18n/LanguageContext.jsx';
import { STAT_GROUPS } from '../../lib/profiles.js';

/**
 * Persönliche Statistik in Gruppen (Events, Ideen, Nachhilfe).
 * null-Werte („noch nicht verfügbar“, z. B. ohne Migration 011) werden als „–“ gezeigt –
 * nie als erfundene 0.
 */
export default function ActivityStats({ stats }) {
  const { t } = useI18n();
  return (
    <div className="activity-stats">
      {STAT_GROUPS.map((group) => (
        <section key={group.id} className="activity-stats__group" aria-labelledby={`stats-${group.id}`}>
          <h3 id={`stats-${group.id}`}>{t(`profiles.statGroups.${group.id}`)}</h3>
          <dl className="activity-stats__list">
            {group.keys.map((key) => (
              <div key={key} className="activity-stats__item">
                <dt>{t(`profiles.stats.${key}`)}</dt>
                <dd>{stats[key] ?? '–'}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
