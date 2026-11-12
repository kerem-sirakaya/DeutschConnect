import { useI18n } from '../../i18n/LanguageContext.jsx';
import Icon from '../Icon.jsx';

/**
 * Hinweis „Gruppe erst nach Admin-Freigabe“. Wird NUR nach einem Erstellungsversuch angezeigt
 * (Projektgruppe auf der Ideenseite, Eventgruppe in der Chat-Moderation) – nie dauerhaft.
 */
export default function GroupApprovalNotice() {
  const { t } = useI18n();
  return (
    <p className="notice notice--info" role="status">
      <Icon name="info" size={16} />
      {t('chat.groupApprovalHint')}
    </p>
  );
}
