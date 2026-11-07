import { useId } from 'react';
import Icon from './Icon.jsx';

export default function SearchField({ label, placeholder, value, onChange, clearLabel }) {
  const id = useId();
  return (
    <div className="search-field">
      <label htmlFor={id} className="visually-hidden">
        {label}
      </label>
      <Icon name="search" size={18} className="search-field__icon" />
      <input
        id={id}
        type="search"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
        enterKeyHint="search"
      />
      {value && (
        <button type="button" className="search-field__clear" onClick={() => onChange('')} aria-label={clearLabel}>
          <Icon name="close" size={16} />
        </button>
      )}
    </div>
  );
}
