import { useState } from 'react';
import { Link } from 'react-router';
import { useI18n } from '../i18n/LanguageContext.jsx';
import { useAppState } from '../state/AppStateContext.jsx';
import { useMySharing } from '../state/useProfiles.js';
import { SHARING_FIELDS } from '../lib/profiles.js';
import PageHeader from '../components/PageHeader.jsx';
import Icon from '../components/Icon.jsx';
import ProfileStatusNotice from '../components/profiles/ProfileStatusNotice.jsx';

/**
 * Profil-Freigabe (/me/sharing). Privat ist Standard; jede Angabe wird einzeln freigegeben.
 * Gespeichert gilt erst, wenn die Datenbank bestätigt (danach wird neu geladen).
 * Demo: nur ansehen, nicht speichern.
 */
export default function ProfileSharingPage() {
  const { t } = useI18n();
  const { user } = useAppState();
  const sharing = useMySharing();
  const [saved, setSaved] = useState(false);
  const ready = sharing.status === 'ready' || sharing.status === 'demo';

  return (
    <div className="page page--narrow">
      <PageHeader title={t('profiles.sharingTitle')} subtitle={t('profiles.sharingSubtitle')} backTo="/me" />
      <ProfileStatusNotice status={sharing.status} errorKey={sharing.errorKey} reload={sharing.reload} />
      {saved && (
        <p className="notice notice--success" role="status">
          <Icon name="check" size={16} />
          {t('profiles.saved')}
        </p>
      )}
      {ready && (
        <SharingForm
          // neu aufbauen, sobald die Datenbank einen neuen Stand liefert
          key={JSON.stringify(sharing.data)}
          initial={sharing.data}
          readOnly={sharing.status === 'demo'}
          onSave={async (values) => {
            setSaved(false);
            const result = await sharing.save(values);
            if (result.ok) setSaved(true);
            return result;
          }}
        />
      )}
      <p>
        <Link to={`/community/people/${user.id}`} className="text-link">
          {t('profiles.openPreview')}
        </Link>
      </p>
    </div>
  );
}

function SharingForm({ initial, readOnly, onSave }) {
  const { t } = useI18n();
  const [values, setValues] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState(null);
  const set = (key) => (event) => setValues((prev) => ({ ...prev, [key]: event.target.checked }));

  const submit = async (event) => {
    event.preventDefault();
    if (readOnly || busy) return;
    setBusy(true);
    setErrorKey(null);
    const result = await onSave(values);
    setBusy(false);
    if (result.errorKey) setErrorKey(result.errorKey);
  };

  return (
    <form className="card stack" onSubmit={submit} aria-busy={busy}>
      <label className="checkbox">
        <input type="checkbox" checked={values.isPublic} onChange={set('isPublic')} disabled={readOnly} />
        <span>
          <strong>{t('profiles.fields.isPublic')}</strong>
          <span className="muted small"> {t('profiles.fields.isPublicHint')}</span>
        </span>
      </label>

      <fieldset className="checkbox-list" disabled={readOnly}>
        <legend>{t('profiles.fieldsLegend')}</legend>
        {SHARING_FIELDS.map((key) => (
          <label key={key} className="checkbox">
            <input type="checkbox" checked={values[key]} onChange={set(key)} />
            <span>{t(`profiles.fields.${key}`)}</span>
          </label>
        ))}
      </fieldset>
      {!values.isPublic && <p className="muted small">{t('profiles.fieldsInactive')}</p>}
      <p className="muted small">{t('profiles.neverShared')}</p>

      {errorKey && (
        <p className="notice notice--error" role="alert">
          {t(errorKey)}
        </p>
      )}
      {readOnly ? (
        <p className="muted">{t('profiles.errors.demoReadOnly')}</p>
      ) : (
        <button type="submit" className="btn btn--primary" disabled={busy}>
          {busy ? t('profiles.saving') : t('profiles.save')}
        </button>
      )}
    </form>
  );
}
