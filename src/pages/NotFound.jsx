import { useLanguage } from '../i18n/LanguageContext.jsx';
import { LinkButton, PageIntro } from '../components/UI.jsx';

export default function NotFound() {
  const { t } = useLanguage();
  return <><PageIntro eyebrow="404" title={t.notFound.title} description={t.notFound.description} /><LinkButton href="#/">{t.notFound.back}</LinkButton></>;
}
