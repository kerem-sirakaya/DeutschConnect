import { Link } from 'react-router';
import Icon from './Icon.jsx';

/** Listenzeile wie in Einstellungs-Menüs (Icon · Titel/Untertitel · Zusatz · Pfeil). */
export default function ListLink({ to, icon, title, subtitle, trailing }) {
  return (
    <li>
      <Link to={to} className="list-link">
        {icon && (
          <span className="list-link__icon">
            <Icon name={icon} size={18} />
          </span>
        )}
        <span className="list-link__body">
          <span className="list-link__title">{title}</span>
          {subtitle && <span className="list-link__subtitle">{subtitle}</span>}
        </span>
        {trailing && <span className="list-link__trailing">{trailing}</span>}
        <Icon name="chevronRight" size={18} className="list-link__chevron" />
      </Link>
    </li>
  );
}
