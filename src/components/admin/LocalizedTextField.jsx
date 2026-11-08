import { useId } from 'react';
import { LANGUAGES, useI18n } from '../../i18n/LanguageContext.jsx';

/**
 * Ein Text in drei Sprachen (de / tr / en) – je ein Eingabefeld.
 * value = { de, tr, en }. Die Sprachnamen kommen aus LANGUAGES (z. B. "Türkçe").
 */
export default function LocalizedTextField({ name, label, hint, value, onChange, maxLength, multiline = false, errorKey, required = false }) {
  const { t } = useI18n();
  const baseId = useId();
  const errorId = `${baseId}-error`;
  const hintId = `${baseId}-hint`;
  const describedBy = [hint ? hintId : null, errorKey ? errorId : null].filter(Boolean).join(' ') || undefined;

  return (
    <fieldset className="field lang-field" data-field={name} tabIndex={-1} aria-invalid={errorKey ? true : undefined}>
      <legend>
        {label}
        {!required && <span className="muted"> · {t('admin.eventForm.optional')}</span>}
      </legend>
      {hint && (
        <p className="field__hint" id={hintId}>
          {hint}
        </p>
      )}
      {LANGUAGES.map((lang) => {
        const id = `${baseId}-${lang.code}`;
        const props = {
          id,
          value: value[lang.code],
          maxLength,
          lang: lang.code,
          'aria-describedby': describedBy,
          'aria-invalid': errorKey ? true : undefined,
          onChange: (e) => onChange({ ...value, [lang.code]: e.target.value }),
        };
        return (
          <div key={lang.code} className="lang-field__row">
            <label htmlFor={id} className="lang-field__lang">
              {lang.label}
            </label>
            {multiline ? <textarea rows={3} {...props} /> : <input type="text" {...props} />}
          </div>
        );
      })}
      {errorKey && (
        <p id={errorId} className="field__error">
          {t(errorKey, { max: maxLength })}
        </p>
      )}
    </fieldset>
  );
}
