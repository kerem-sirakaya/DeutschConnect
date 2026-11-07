import Icon from './Icon.jsx';
import { useLanguage } from '../i18n/LanguageContext.jsx';
import { useEffect, useRef } from 'react';

export function LinkButton({ href, children, secondary = false, className = '' }) {
  return <a href={href} className={`button ${secondary ? 'button-secondary' : ''} ${className}`}>{children}<Icon name="arrow" size={18} /></a>;
}

export function StatusBadge({ children, muted = false }) {
  return <span className={`status-badge ${muted ? 'status-muted' : ''}`}><span />{children}</span>;
}

export function SectionHeading({ eyebrow, title, description, href, link }) {
  return <div className="section-heading"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h2>{title}</h2>{description && <p className="section-description">{description}</p>}</div>{href && <a className="text-link" href={href}>{link}<Icon name="arrow" size={18} /></a>}</div>;
}

export function DemoNotice() {
  const { t } = useLanguage();
  return <div className="demo-notice"><Icon name="info" size={19} /><p>{t.demoNotice}</p></div>;
}

export function PageIntro({ eyebrow, title, description }) {
  return <div className="page-intro">{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1>{description && <p>{description}</p>}</div>;
}

export function ModuleTabs({ items, label }) {
  const navRef = useRef(null);
  const activeHref = items.find((item) => item.active)?.href;
  const activeLabel = items.find((item) => item.active)?.label;
  useEffect(() => {
    navRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
  }, [activeHref, activeLabel, label]);
  return <nav className="module-tabs" aria-label={label} ref={navRef}>{items.map((item) => <a key={item.href} href={item.href} aria-current={item.active ? 'page' : undefined}>{item.label}</a>)}</nav>;
}

export function EmptyState({ text, href, action, icon = 'calendar' }) {
  return <div className="empty-state"><Icon name={icon} size={25} /><p>{text}</p>{href && <a className="text-link" href={href}>{action}<Icon name="arrow" size={16} /></a>}</div>;
}

export function SearchField({ value, onChange, label }) {
  return <label className="search-field"><Icon name="search" size={19} /><span className="sr-only">{label}</span><input type="search" value={value} onChange={(event) => onChange(event.target.value)} placeholder={label} /></label>;
}
