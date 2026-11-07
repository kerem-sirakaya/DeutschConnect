import { useId } from 'react';
import { Link } from 'react-router';
import Icon from './Icon.jsx';

/** Abschnitt mit Überschrift und optionalem "Alle anzeigen"-Link. */
export default function Section({ title, icon, linkTo, linkLabel, children, className = '' }) {
  const headingId = useId();
  return (
    <section className={`section ${className}`} aria-labelledby={headingId}>
      <div className="section__head">
        <h2 id={headingId} className="section__title">
          {icon && <Icon name={icon} size={18} />}
          {title}
        </h2>
        {linkTo && (
          <Link to={linkTo} className="section__link">
            {linkLabel}
            <Icon name="chevronRight" size={16} />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}
