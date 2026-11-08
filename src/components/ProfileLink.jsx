import { useDemo } from '../state/DemoContext.jsx';
import { useLanguage } from '../i18n/LanguageContext.jsx';
import { selectPublicProfile } from '../data/profiles.js';

export default function ProfileLink({ id }) {
  const { state } = useDemo();
  const { t } = useLanguage();
  const member = selectPublicProfile(state,id);
  const name = state.profiles[id]?.displayName || t.app.community;
  const [path,search = ''] = (typeof window === 'undefined' ? '/community/people' : window.location.hash.slice(1)).split('?');
  const params = new URLSearchParams(search); params.delete('from');
  const from = path + (params.size ? '?' + params : '');
  return member ? <a className="text-link profile-link" href={'#/community/people/' + encodeURIComponent(id) + '?from=' + encodeURIComponent(from)} aria-label={t.personal.profile.open + ': ' + member.displayName}>{member.displayName}</a> : <span>{name}</span>;
}
