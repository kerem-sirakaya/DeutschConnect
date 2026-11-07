import { Link, useSearchParams } from 'react-router';

/**
 * Segment-Navigation für Unterbereiche einer Seite (z. B. Meine / Für mich / Alle).
 * Der aktive Tab steht in der URL (?tab=...), damit "Zurück" und Links funktionieren.
 */
export default function Tabs({ tabs, active, label }) {
  const [params] = useSearchParams();

  const hrefFor = (id) => {
    const next = new URLSearchParams(params);
    next.set('tab', id);
    return `?${next.toString()}`;
  };

  return (
    <nav className="tabs" aria-label={label}>
      {tabs.map((tab) => (
        <Link
          key={tab.id}
          to={hrefFor(tab.id)}
          replace
          className="tabs__item"
          aria-current={active === tab.id ? 'page' : undefined}
        >
          <span>{tab.label}</span>
          {typeof tab.count === 'number' && <span className="tabs__count">{tab.count}</span>}
        </Link>
      ))}
    </nav>
  );
}
