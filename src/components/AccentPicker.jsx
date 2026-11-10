import { useEffect, useId, useRef, useState } from 'react';
import { useI18n } from '../i18n/LanguageContext.jsx';
import { ACCENTS, ACCENT_NAME_KEYS, chooseAccent } from '../lib/theme.js';
import { useAccent } from '../hooks/useAccent.js';
import Icon from './Icon.jsx';

/**
 * Paletten-Symbol oben rechts: einzige Stelle zum Wechseln der Akzentfarbe (die Auswahl unter
 * Einstellungen → Darstellung wurde entfernt). Ein Klick wendet die Farbe sofort an und speichert sie.
 * Bedienung: Klick/Enter öffnet, Pfeiltasten wählen, Escape oder Klick daneben schließt.
 */
export default function AccentPicker() {
  const { t } = useI18n();
  const accent = useAccent();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const buttonRef = useRef(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return undefined;
    // ausgewählte Farbe fokussieren → Pfeiltasten funktionieren sofort
    wrapRef.current?.querySelector('input:checked')?.focus();
    const onPointer = (event) => {
      if (!wrapRef.current?.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="accent-menu" ref={wrapRef}>
      <button
        ref={buttonRef}
        type="button"
        className="accent-menu__button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={t('appearance.paletteButton')}
        title={t('appearance.paletteButton')}
        onClick={() => setOpen((value) => !value)}
      >
        <Icon name="palette" size={20} />
      </button>
      {open && (
        <div id={panelId} className="accent-menu__panel">
          <fieldset className="accent-menu__list">
            <legend className="accent-menu__title">{t('appearance.accentLegend')}</legend>
            {ACCENTS.map((option) => (
              <label key={option.id} className="accent-menu__option">
                <input
                  type="radio"
                  name="accent-quick"
                  value={option.id}
                  checked={accent === option.id}
                  onChange={() => chooseAccent(option.id)}
                  className="accent-option__input"
                />
                <span className="accent-menu__row">
                  <span className="accent-option__swatch accent-menu__swatch" style={{ '--swatch': option.swatch }} aria-hidden="true">
                    {accent === option.id && <Icon name="check" size={14} />}
                  </span>
                  <span>{t(ACCENT_NAME_KEYS[option.id])}</span>
                </span>
              </label>
            ))}
          </fieldset>
        </div>
      )}
    </div>
  );
}
