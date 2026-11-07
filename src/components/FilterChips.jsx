/**
 * Pillenförmige Filter. Einzelauswahl (value = String) oder Mehrfachauswahl
 * (multiple, value = Array). Ausgewählte Chips haben aria-pressed="true".
 */
export default function FilterChips({ label, options, value, onChange, multiple = false, wrap = false, showLabel = false }) {
  const isSelected = (optionValue) => (multiple ? value.includes(optionValue) : value === optionValue);

  return (
    <div className="chip-field">
      {showLabel && <span className="chip-field__label">{label}</span>}
      <div className={`chip-group${wrap ? ' chip-group--wrap' : ''}`} role="group" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className="chip"
            aria-pressed={isSelected(option.value)}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
