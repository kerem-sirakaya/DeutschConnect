import { useLanguage } from '../i18n/LanguageContext.jsx';

export default function ActivityStatistics({ counts, publicView = false }) {
  const { t } = useLanguage();
  const keys = publicView ? Object.keys(counts) : ['activeProjects','completedProjects','ownedProjects','upcomingRegistrations','confirmedAttendance','tutoringOffers','tutoringRequests','awards'];
  return <dl className="personal-statistics">{keys.map((key) => <div className="content-card" key={key}><dt>{t.personal.statistics[key]}</dt><dd>{counts[key]}</dd></div>)}</dl>;
}
