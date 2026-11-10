import { useEffect, useRef, useState } from 'react';

const PATHS = {
  home: <><path d="M3.5 11 12 4l8.5 7" /><path d="M5.5 9.5V20h13V9.5" /></>,
  cal: <><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
  cart: <><path d="M3 4h2l2.2 11h11l2-8H6.3" /><circle cx="9" cy="19.5" r="1.4" /><circle cx="17" cy="19.5" r="1.4" /></>,
  bell: <><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></>,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  plus: <path d="M12 5v14M5 12h14" />,
  check: <path d="M5 12.5l4.5 4.5L19 7" />,
  chev: <path d="M9 6l6 6-6 6" />,
  down: <path d="M6 9l6 6 6-6" />,
  left: <path d="M15 6l-6 6 6 6" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  trash: <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />,
  upload: <><path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 16v4h16v-4" /></>,
  repeat: <><path d="M17 2l3 3-3 3" /><path d="M4 11V9a4 4 0 0 1 4-4h12" /><path d="M7 22l-3-3 3-3" /><path d="M20 13v2a4 4 0 0 1-4 4H4" /></>,
};

export function Icon({ name, size = 20, stroke = 2.2, ...rest }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      {PATHS[name]}
    </svg>
  );
}

export function Check({ on, round }) {
  return <span className={`check${on ? ' on' : ''}${round ? ' round' : ''}`} aria-hidden="true">{on && <Icon name="check" size={16} stroke={3} />}</span>;
}

export function Sheet({ title, onClose, children, actions }) {
  const ref = useRef(null);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [onClose]);
  return (
    <div className="sheet-bg" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <div className="sheet-grip" />
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Schließen"><Icon name="x" /></button>
        </div>
        {children}
        {actions}
      </div>
    </div>
  );
}

export function personChip(p) {
  if (!p) return null;
  return <span key={p.id} className="pchip" style={{ background: p.bg, color: p.color }}>{p.name}</span>;
}

export function PersonChips({ who, members }) {
  if (!who || who.includes('all')) return <span className="pchips"><span className="pchip" style={{ background: '#CCFBF1', color: '#0F766E' }}>Alle</span></span>;
  return <span className="pchips">{who.map((id) => personChip(members.find((m) => m.id === id)))}</span>;
}

export function ChipPick({ options, value, onPick, multi }) {
  // options: [{id, label, color, bg}]
  const isOn = (id) => (multi ? value.includes(id) : value === id);
  return (
    <div className="chips" role="group">
      {options.map((o) => {
        const on = isOn(o.id);
        return (
          <button key={o.id} type="button" className={`chip${on ? ' on' : ''}`} aria-pressed={on}
            style={on ? { background: o.color || '#1C1917', borderColor: o.color || '#1C1917' } : { color: o.color || '#1C1917', borderColor: o.bg || '#E7E1D8' }}
            onClick={() => onPick(o.id)}>{o.label}</button>
        );
      })}
    </div>
  );
}

export function Seg({ options, value, onPick, label }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map(([id, text]) => (
        <button key={id} type="button" className={value === id ? 'on' : ''} aria-pressed={value === id} onClick={() => onPick(id)}>{text}</button>
      ))}
    </div>
  );
}

// Zeile, die man nach rechts (erledigt) oder links (löschen) wischen kann.
export function Swipe({ onRight, onLeft, rightLabel = 'Erledigt', leftLabel = 'Löschen', children }) {
  const [dx, setDx] = useState(0);
  const st = useRef(null);
  const down = (e) => { st.current = { x: e.clientX, y: e.clientY, active: false }; };
  const move = (e) => {
    const s = st.current;
    if (!s) return;
    const mx = e.clientX - s.x;
    const my = e.clientY - s.y;
    if (!s.active && Math.abs(mx) > 12 && Math.abs(mx) > Math.abs(my) * 1.5) s.active = true;
    if (s.active) setDx(Math.max(onLeft ? -140 : 0, Math.min(onRight ? 140 : 0, mx)));
  };
  const up = () => {
    const s = st.current;
    st.current = null;
    if (s?.active) {
      if (dx > 90 && onRight) onRight();
      else if (dx < -90 && onLeft) onLeft();
    }
    setDx(0);
  };
  const clickCapture = (e) => { if (Math.abs(dx) > 5) { e.stopPropagation(); e.preventDefault(); } };
  return (
    <div className="swipe">
      {dx > 0 && <div className="swipe-bg r"><Icon name="check" size={18} />&nbsp;{rightLabel}</div>}
      {dx < 0 && <div className="swipe-bg l">{leftLabel}&nbsp;<Icon name="trash" size={18} /></div>}
      <div className="swipe-fg" style={{ transform: `translateX(${dx}px)`, transition: dx === 0 ? 'transform 0.15s' : 'none' }}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onClickCapture={clickCapture}>
        {children}
      </div>
    </div>
  );
}

export function Toast({ toast, onClose }) {
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(onClose, toast.undo ? 5000 : 2600);
    return () => clearTimeout(t);
  }, [toast, onClose]);
  if (!toast) return null;
  return (
    <div className="toast" role="status">
      <span>{toast.text}</span>
      {toast.undo && <button onClick={() => { toast.undo(); onClose(); }}>Rückgängig</button>}
    </div>
  );
}
