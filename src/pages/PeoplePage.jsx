import { useState } from 'react';
import { Link } from 'react-router';
import { useI18n } from '../i18n/LanguageContext.jsx';
import { getSchool } from '../data/schools.js';
import { usePublicProfiles } from '../state/useProfiles.js';
import { filterDirectory } from '../lib/profiles.js';
import PageHeader from '../components/PageHeader.jsx';
import SearchField from '../components/SearchField.jsx';
import Avatar from '../components/Avatar.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Icon from '../components/Icon.jsx';
import { TopicTags } from '../components/Badges.jsx';
import ProfileStatusNotice from '../components/profiles/ProfileStatusNotice.jsx';

/** Verzeichnis der FREIWILLIG freigegebenen Profile (/community/people). */
export default function PeoplePage() {
  const { t } = useI18n();
  const directory = usePublicProfiles();
  const [query, setQuery] = useState('');
  const profiles = directory.data ?? [];
  const describe = (p) => [getSchool(p.schoolId)?.name ?? '', ...p.interests.map((i) => t(`topics.${i}`))].join(' ');
  const visible = filterDirectory(profiles, { query }, describe);

  return (
    <div className="page">
      <PageHeader title={t('profiles.peopleTitle')} subtitle={t('profiles.peopleSubtitle')} backTo="/community" />

      <p className="notice notice--info">
        <Icon name="shield" size={16} />
        <span>
          {t('profiles.onlyShared')}{' '}
          <Link to="/me/sharing" className="text-link">
            {t('profiles.manageMine')}
          </Link>
        </span>
      </p>

      <ProfileStatusNotice status={directory.status} errorKey={directory.errorKey} reload={directory.reload} />

      {(directory.status === 'ready' || directory.status === 'demo') && (
        <>
          <SearchField
            label={t('profiles.searchLabel')}
            placeholder={t('profiles.searchPlaceholder')}
            value={query}
            onChange={setQuery}
            clearLabel={t('common.clearSearch')}
          />
          {visible.length === 0 ? (
            <EmptyState icon="users" title={profiles.length ? t('profiles.noMatches') : t('profiles.noPublic')} />
          ) : (
            <ul className="people-list">
              {visible.map((person) => {
                const school = getSchool(person.schoolId);
                return (
                  <li key={person.id}>
                    <Link to={`/community/people/${person.id}`} className="card person-card">
                      <Avatar profile={person} />
                      <span className="person-card__body">
                        <span className="person-card__name">
                          {person.firstName}
                          {person.isDemo && <span className="badge badge--demo">{t('demo.label')}</span>}
                        </span>
                        {school && <span className="muted">{school.name}</span>}
                        {person.interests.length > 0 && <TopicTags topics={person.interests.slice(0, 4)} />}
                      </span>
                      <Icon name="chevronRight" size={18} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
