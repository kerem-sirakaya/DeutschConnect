import Icon from './Icon.jsx';

export default function EmptyState({ icon = 'info', title, text, action }) {
  return (
    <div className="empty-state">
      <span className="empty-state__icon">
        <Icon name={icon} />
      </span>
      <div className="empty-state__body">
        <p className="empty-state__title">{title}</p>
        {text && <p className="empty-state__text">{text}</p>}
        {action && <div className="empty-state__action">{action}</div>}
      </div>
    </div>
  );
}
