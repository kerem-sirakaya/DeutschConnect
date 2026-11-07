export function TextField({ id, name = id, label, value, onChange, maxLength, minLength, required = false, multiline = false, error, hint, autoComplete, disabled = false }) {
  const describedBy = [hint && id + '-hint', error && id + '-error'].filter(Boolean).join(' ') || undefined;
  const props = { id, name, value, maxLength, minLength, required, autoComplete, disabled, 'aria-invalid': Boolean(error), 'aria-describedby': describedBy, onChange: (event) => onChange(event.target.value) };
  return <div className="form-field"><label htmlFor={id}>{label}</label>{multiline ? <textarea {...props} rows={4} /> : <input {...props} />}{hint && <p className="small-text" id={id + '-hint'}>{hint}</p>}{error && <p className="field-error" id={id + '-error'} role="alert">{error}</p>}</div>;
}

export function CheckOptions({ id, legend, options, value, onChange, error, hint }) {
  const describedBy = [hint && id && id + '-hint', error && id && id + '-error'].filter(Boolean).join(' ') || undefined;
  return <fieldset id={id} tabIndex={id ? -1 : undefined} aria-invalid={Boolean(error)} aria-describedby={describedBy}><legend>{legend}</legend>{hint && <p className="small-text" id={id ? id + '-hint' : undefined}>{hint}</p>}<div className="interest-options">{options.map(({ key, label }) => <label key={key}><input type="checkbox" checked={value.includes(key)} onChange={() => onChange(value.includes(key) ? value.filter((item) => item !== key) : [...value, key])} /><span>{label}</span></label>)}</div>{error && <p className="field-error" id={id ? id + '-error' : undefined} role="alert">{error}</p>}</fieldset>;
}
