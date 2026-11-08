import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useI18n } from '../../i18n/LanguageContext.jsx';
import { localize } from '../../i18n/localize.js';
import { useAppState } from '../../state/AppStateContext.jsx';
import { supabase } from '../../lib/supabaseClient.js';
import { formatDateLong } from '../../lib/format.js';
import { formatAnkaraDateTime } from '../../lib/eventForm.js';
import {
  OVERVIEW_QUICK_ACTIONS,
  OVERVIEW_STATS,
  loadOverviewStats,
  loadRecentActivity,
  statValue,
} from '../../lib/adminOverview.js';
import PageHeader from '../../components/PageHeader.jsx';
import Section from '../../components/Section.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import Icon from '../../components/Icon.jsx';
import { StatusBadge } from '../../components/Badges.jsx';

/**
 * Admin-Übersicht (/admin): Kennzahlen, Schnellzugriff, Aktivitäten.
 *
 * Sicherheit: Diese Seite wird nur innerhalb von AdminRoute geladen (lazy). Die Daten
 * kommen ausschließlich aus admin_*-RPCs, die selbst is_admin() prüfen.
 * Bei Kontowechsel/Abmelden entfernt AdminRoute die Seite – ihr Zustand verschwindet mit ihr.
 * Nichts davon wird im Browser gespeichert.
 *
 * Kennzahlen und Aktivitäten laden UNABHÄNGIG voneinander: Fällt eins aus, bleibt das
 * andere sichtbar.
 */
export default function AdminOverviewPage() {
  const { t, locale } = useI18n();
  const { user } = useAppState();

  const [stats, setStats] = useState({ status: 'loading', stats: null, errorKey: null });
  const [statsToken, setStatsToken] = useState(0);
  const [activity, setActivity] = useState({ status: 'loading', items: [], errorKey: null });
  const [activityToken, setActivityToken] = useState(0);

  useEffect(() => {
    let active = true;
    loadOverviewStats(supabase).then((result) => active && setStats(result));
    return () => {
      active = false;
    };
  }, [statsToken]);

  useEffect(() => {
    let active = true;
    loadRecentActivity(supabase).then((result) => active && setActivity(result));
    return () => {
      active = false;
    };
  }, [activityToken]);

  const retryStats = () => {
    setStats({ status: 'loading', stats: null, errorKey: null });
    setStatsToken((n) => n + 1);
  };
  const retryActivity = () => {
    setActivity({ status: 'loading', items: [], errorKey: null });
    setActivityToken((n) => n + 1);
  };

  const today = formatDateLong(new Date(), locale);

  return (
    <div className="admin-overview">
      <PageHeader title={t('admin.overview.title')} subtitle={t('admin.overview.subtitle')} />
      <p className="admin-overview__context">
        <Icon name="shield" size={14} />
        {user?.firstName
          ? t('admin.overview.context', { name: user.firstName, date: today })
          : t('admin.overview.contextNoName', { date: today })}
      </p>

      {/* ---------- Kennzahlen ---------- */}
      <Section title={t('admin.overview.statsTitle')} icon="sparkles">
        {stats.status === 'loading' && (
          <p className="visually-hidden" role="status">
            {t('admin.overview.statsLoading')}
          </p>
        )}
        {stats.status === 'unavailable' && (
          <p className="notice notice--demo" role="status">
            <Icon name="info" size={16} />
            {t('admin.overview.statsUnavailable')}
          </p>
        )}
        {stats.status === 'error' && (
          <div className="notice notice--error admin-overview__error" role="alert">
            <Icon name="info" size={16} />
            <span>{t(stats.errorKey ?? 'admin.errors.generic')}</span>
            <button type="button" className="btn btn--secondary btn--sm" onClick={retryStats}>
              <Icon name="refresh" size={16} />
              {t('admin.statusError.retry')}
            </button>
          </div>
        )}

        <ul className="admin-stats" aria-busy={stats.status === 'loading'}>
          {OVERVIEW_STATS.map((stat) => (
            <li key={stat.key}>
              <StatCard stat={stat} state={stats} />
            </li>
          ))}
        </ul>
      </Section>

      {/* ---------- Schnellzugriff ---------- */}
      <Section title={t('admin.overview.quickTitle')} icon="arrowRight">
        <nav aria-label={t('admin.overview.quickTitle')}>
          <ul className="admin-quick">
            {OVERVIEW_QUICK_ACTIONS.map((action) => (
              <li key={action.to}>
                <Link to={action.to} className={`admin-quick__item${action.primary ? ' admin-quick__item--primary' : ''}`}>
                  <span className="admin-quick__icon">
                    <Icon name={action.icon} size={20} />
                  </span>
                  <span className="admin-quick__text">
                    <span className="admin-quick__label">{t(action.labelKey)}</span>
                    <span className="admin-quick__desc">{t(action.descKey)}</span>
                  </span>
                  <Icon name="chevronRight" size={18} className="admin-quick__chevron" />
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </Section>

      {/* ---------- Aktivitäten ---------- */}
      <Section title={t('admin.overview.activityTitle')} icon="clock">
        <p className="hint">
          <Icon name="info" size={14} />
          {t('admin.overview.activityNote')}
        </p>

        {activity.status === 'loading' && (
          <p className="card settings-block" role="status" aria-live="polite">
            {t('admin.overview.activityLoading')}
          </p>
        )}

        {activity.status === 'error' && (
          <div className="notice notice--error admin-overview__error" role="alert">
            <Icon name="info" size={16} />
            <span>{t(activity.errorKey ?? 'admin.errors.generic')}</span>
            <button type="button" className="btn btn--secondary btn--sm" onClick={retryActivity}>
              <Icon name="refresh" size={16} />
              {t('admin.statusError.retry')}
            </button>
          </div>
        )}

        {activity.status === 'ready' && activity.items.length === 0 && (
          <EmptyState icon="clock" title={t('admin.overview.activityEmpty')} />
        )}

        {activity.status === 'ready' && activity.items.length > 0 && (
          <ul className="admin-activity">
            {activity.items.map((item) => (
              <li key={`${item.type}-${item.id}`}>
                <ActivityRow item={item} locale={locale} />
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

/** Eine Kennzahl. Unbekannte Werte erscheinen als "–", nie als 0. */
function StatCard({ stat, state }) {
  const { t } = useI18n();
  const loading = state.status === 'loading';
  const value = state.status === 'ready' ? statValue(state.stats, stat.key) : null;
  const unknown = !loading && value == null;
  // Nur Archiv: eigener Hinweis, wenn 010 läuft, aber 008 noch fehlt
  const desc =
    state.status === 'ready' && value == null && stat.unavailableKey ? t(stat.unavailableKey) : t(stat.descKey);

  const content = (
    <>
      <span className="admin-stat__icon">
        <Icon name={stat.icon} size={20} />
      </span>
      <span className="admin-stat__value">
        {loading ? (
          <span className="admin-stat__skeleton" aria-hidden="true" />
        ) : unknown ? (
          <>
            <span aria-hidden="true">–</span>
            <span className="visually-hidden">{t('admin.overview.valueUnavailable')}</span>
          </>
        ) : (
          value
        )}
      </span>
      <span className="admin-stat__label">{t(stat.labelKey)}</span>
      <span className="admin-stat__desc">{desc}</span>
    </>
  );

  return stat.to ? (
    <Link to={stat.to} className="admin-stat admin-stat--link">
      {content}
    </Link>
  ) : (
    <div className="admin-stat">{content}</div>
  );
}

function ActivityRow({ item, locale }) {
  const { t, language } = useI18n();
  const isEvent = item.type === 'event';
  const title = localize(item.title, language) || t('admin.overview.activityUntitled');
  return (
    <Link to={item.to} className="admin-activity__row">
      <span className="admin-activity__icon">
        <Icon name={isEvent ? 'calendar' : 'lightbulb'} size={18} />
      </span>
      <span className="admin-activity__body">
        <span className="admin-activity__what">
          {t(isEvent ? 'admin.overview.activityEventCreated' : 'admin.overview.activityIdeaSubmitted')}
        </span>
        <span className="admin-activity__title">{title}</span>
        <span className="admin-activity__meta">
          <time dateTime={item.createdAt}>{formatAnkaraDateTime(item.createdAt, locale)}</time>
          <StatusBadge type={isEvent ? 'event' : 'idea'} status={item.status} />
          {item.archived && <span className="badge badge--muted">{t('admin.events.archived')}</span>}
        </span>
      </span>
      <Icon name="chevronRight" size={18} className="admin-activity__chevron" />
    </Link>
  );
}
