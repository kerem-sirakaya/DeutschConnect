import Icon from './Icon.jsx';

/** Faktenliste für Detailseiten (Wann, Wo, Wer …). items: [{ icon, label, value }] */
export default function InfoList({ items }) {
  return (
    <dl className="info-list">
      {items
        .filter((item) => item.value)
        .map((item) => (
          <div key={item.label} className="info-list__item">
            <dt>
              <Icon name={item.icon} size={18} />
              <span>{item.label}</span>
            </dt>
            <dd>{item.value}</dd>
          </div>
        ))}
    </dl>
  );
}
