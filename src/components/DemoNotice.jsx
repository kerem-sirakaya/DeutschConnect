import { useI18n } from '../i18n/LanguageContext.jsx';
import Icon from './Icon.jsx';

/** Kurzer, deutlicher Hinweis, dass es sich um Demo-Daten handelt. */
export default function DemoNotice({ textKey = 'demo.notice' }) {
  const { t } = useI18n();
  return (
    <p className="notice notice--demo">
      <Icon name="info" size={16} />
      <span>{t(textKey)}</span>
    </p>
  );
}
