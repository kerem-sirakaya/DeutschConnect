import { useI18n } from '../i18n/LanguageContext.jsx';
import { ACCENTS, ACCENT_NAME_KEYS as NAME_KEYS, DEFAULT_ACCENT, chooseAccent } from '../lib/theme.js';
import { useAccent } from '../hooks/useAccent.js';
import Icon from './Icon.jsx';

/**
 * Einstellungen → Darstellung: Akzentfarbe wählen (6 feste Farben), Vorschau, zurücksetzen.
 * Ein Klick wendet die Farbe sofort an und speichert sie im Browser (localStorage).
 * Native Radio-Buttons → mit Tastatur (Pfeiltasten) und Screenreader bedienbar.
 */
export default function AppearanceSettings() {
  const { t } = useI18n();
  // gemeinsamer Zustand: Änderungen über die Palette in der Kopfzeile erscheinen hier sofort
  const accent = useAccent();
  const choose = chooseAccent;

  return (
    <section className="card settings-block" aria-labelledby="settings-appearance" id="appearance">
      <h2 id="settings-appearance">{t('appearance.title')}</h2>
      <p className="muted">{t('appearance.intro')}</p>

      <fieldset className="accent-picker">
        <legend className="accent-picker__legend">{t('appearance.accentLegend')}</legend>
        <div className="accent-picker__grid">
          {ACCENTS.map((option) => (
            <label key={option.id} className="accent-option">
              <input
                type="radio"
                name="accent"
                value={option.id}
                checked={accent === option.id}
                onChange={() => choose(option.id)}
                className="accent-option__input"
              />
              <span className="accent-option__body">
                <span className="accent-option__swatch" style={{ '--swatch': option.swatch }} aria-hidden="true">
                  {accent === option.id && <Icon name="check" size={16} />}
                </span>
                <span className="accent-option__text">
                  <span className="accent-option__name">{t(NAME_KEYS[option.id])}</span>
                  {option.id === DEFAULT_ACCENT && <span className="accent-option__default">{t('appearance.default')}</span>}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="accent-preview" aria-label={t('appearance.preview')} role="group">
        <p className="accent-preview__label">{t('appearance.preview')}</p>
        <div className="accent-preview__row">
          <span className="btn btn--primary btn--sm" aria-hidden="true">{t('appearance.previewPrimary')}</span>
          <span className="btn btn--secondary btn--sm" aria-hidden="true">{t('appearance.previewSecondary')}</span>
          <span className="accent-preview__pill" aria-hidden="true">{t('appearance.previewChip')}</span>
          <span className="text-link" aria-hidden="true">{t('appearance.previewLink')}</span>
        </div>
      </div>

      <div className="accent-picker__footer">
        <p className="muted small" role="status">
          {t('appearance.current', { name: t(NAME_KEYS[accent]) })} · {t('appearance.localOnly')}
        </p>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() => choose(DEFAULT_ACCENT)}
          disabled={accent === DEFAULT_ACCENT}
        >
          <Icon name="refresh" size={16} />
          {t('appearance.reset')}
        </button>
      </div>
    </section>
  );
}
