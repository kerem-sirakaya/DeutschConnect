import { Link } from 'react-router';
import { useI18n } from '../i18n/LanguageContext.jsx';
import { localize } from '../i18n/localize.js';
import { useAppState } from '../state/AppStateContext.jsx';
import { getSchool } from '../data/schools.js';
import { StatusBadge } from './Badges.jsx';
import SupportButton from './SupportButton.jsx';

export default function IdeaCard({ idea }) {
  const { t, language } = useI18n();
  const { user } = useAppState();
  const isOwn = idea.authorId === user.id;
  const school = getSchool(idea.schoolId);

  return (
    <article className="idea-card">
      <Link to={`/ideas/${idea.id}`} className="idea-card__link">
        <h3 className="idea-card__title">{localize(idea.title, language)}</h3>
        <p className="idea-card__summary">{localize(idea.summary, language)}</p>
      </Link>
      <div className="idea-card__footer">
        <span className="idea-card__meta">
          <StatusBadge type="idea" status={idea.status} />
          {isOwn ? (
            <span className="badge badge--role">{t('ideas.yourIdea')}</span>
          ) : (
            <span className="idea-card__school">{t('ideas.fromSchool', { school: school?.shortName ?? '' })}</span>
          )}
        </span>
        <SupportButton idea={idea} compact />
      </div>
    </article>
  );
}
