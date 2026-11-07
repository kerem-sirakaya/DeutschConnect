import { useLanguage } from '../i18n/LanguageContext.jsx';
import { ModuleTabs } from './UI.jsx';

export function DiscoverNavigation({ active }) {
  const { t } = useLanguage();
  return <ModuleTabs label={t.nav.discover} items={[
    ['initiatives', '/discover'], ['events', '/events/all'], ['projects', '/ideas/all'], ['schools', '/network'],
  ].map(([key, path]) => ({ label: t.ext.discover[key], href: '#' + path, active: active === key }))} />;
}

export function CommunityNavigation({ active }) {
  const { t } = useLanguage();
  return <ModuleTabs label={t.nav.community} items={['people', 'projects', 'rooms', 'games', 'my'].map((key) => ({ label: key === 'games' ? t.games.title : t.ext.community[key], href: '#/community/' + key, active: active === key }))} />;
}
