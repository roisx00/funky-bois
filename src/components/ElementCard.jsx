import { getElementSVG, ELEMENT_LABELS, ELEMENT_VARIANTS } from '../data/elements';

export default function ElementCard({
  type,
  variant,
  quantity = 1,
  selected = false,
  selectable = false,
  onClick,
  size = 'md', // 'sm' | 'md' | 'lg'
}) {
  const info = ELEMENT_VARIANTS[type]?.[variant];
  if (!info) return null;

  const svgContent = getElementSVG(type, variant);

  const cardClass = [
    'element-card',
    selectable ? 'selectable' : '',
    selected    ? 'selected'   : '',
    size === 'sm' ? 'element-card-sm' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={cardClass} onClick={selectable ? onClick : undefined}>
      <div className="element-card-art">
        <svg
          viewBox="0 0 100 100"
          xmlns="http://www.w3.org/2000/svg"
          width="100%"
          height="100%"
          dangerouslySetInnerHTML={{ __html: svgContent }}
        />
      </div>

      <div className="element-card-info">
        <div className="element-type-label">{ELEMENT_LABELS[type]}</div>
        <div className="element-name">{info.name}</div>
        <div className="element-card-footer">
          <span className={`badge badge-${info.rarity}`}>{info.rarity}</span>
          {quantity > 1 && <span className="element-qty">×{quantity}</span>}
        </div>
      </div>
    </div>
  );
}
