import { useEffect, useRef, useState } from 'react';

const DOC = <><path d="M14 3.5H6.5a1 1 0 0 0-1 1v15a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V8z" /><path d="M14 3.5V8h4.5" /></>;
const CLOUD = <path d="M7 18.5h10a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 7 9.5a4.5 4.5 0 0 0 0 9z" />;
const PATHS = {
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" /></>,
  partsun: <><path d="M8 3.5v1.2M3.5 8h1.2M4.8 4.8l.9.9M11.2 4.8l-.9.9" /><path d="M5.6 10.4A3 3 0 1 1 10.7 7" /><path d="M9 20h8.5a3.5 3.5 0 0 0 .4-6.98A4.8 4.8 0 0 0 9 12.2 3.9 3.9 0 0 0 9 20z" /></>,
  cloud: CLOUD,
  fog: <><path d="M4 9h16M3 13h18M5 17h14" /></>,
  rain: <><path d="M7 14.5h10a3.8 3.8 0 0 0 .5-7.55A5.2 5.2 0 0 0 7 6a4.2 4.2 0 0 0 0 8.5z" /><path d="M8 17.5l-1 3M12 17.5l-1 3M16 17.5l-1 3" /></>,
  snow: <><path d="M7 14.5h10a3.8 3.8 0 0 0 .5-7.55A5.2 5.2 0 0 0 7 6a4.2 4.2 0 0 0 0 8.5z" /><path d="M8 18.5h.01M12 20h.01M16 18.5h.01" strokeWidth="3" /></>,
  storm: <><path d="M7 14.5h10a3.8 3.8 0 0 0 .5-7.55A5.2 5.2 0 0 0 7 6a4.2 4.2 0 0 0 0 8.5z" /><path d="M12.5 15.5l-2 3.5h3l-2 3.5" /></>,
  drop: <path d="M12 3.5s6 6.6 6 10.5a6 6 0 0 1-12 0c0-3.9 6-10.5 6-10.5z" />,
  house: <><path d="M3.5 11 12 4l8.5 7" /><path d="M5.5 9.5V20h13V9.5" /><path d="M10 20v-5h4v5" /></>,
  tree: <><path d="M12 21v-5" /><path d="M12 3.5 6 12h3l-3.5 4.5h13L15 12h3z" /></>,
  heart: <path d="M12 20s-7.5-4.6-7.5-10.1A4.2 4.2 0 0 1 12 7.3a4.2 4.2 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z" />,
  car: <><path d="M4 16.5V12l2-5h12l2 5v4.5" /><path d="M3 12h18v4.5H3z" /><circle cx="7.5" cy="18" r="1.6" /><circle cx="16.5" cy="18" r="1.6" /></>,
  cake: <><path d="M4.5 20.5h15v-7a1.5 1.5 0 0 0-1.5-1.5H6a1.5 1.5 0 0 0-1.5 1.5z" /><path d="M4.5 16c1.5 1 3 1 4.5 0s3-1 4.5 0 3 1 4.5 0" /><path d="M12 12V8.5M12 5.5c-.8.9-.8 1.9 0 2.5.8-.6.8-1.6 0-2.5z" /></>,
  pencil: <><path d="M15.5 4.5l4 4L8.5 19.5H4.5v-4z" /><path d="M13 7l4 4" /></>,
  party: <><path d="M4 20l4.5-12 7.5 7.5z" /><path d="M14 4.5c.5 1.5 0 2.5-1 3M18 7.5c1-.5 2-.3 2.5.5M16 2.5v1.5M20.5 11.5h1.5M19 4l1-1" /></>,
  dice: <><rect x="4" y="4" width="16" height="16" rx="3.5" /><path d="M9 9h.01M15 9h.01M12 12h.01M9 15h.01M15 15h.01" strokeWidth="3.2" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  balloon: <><path d="M12 15.5c-3.3 0-6-3-6-6.5S8.7 2.5 12 2.5s6 3 6 6.5-2.7 6.5-6 6.5z" /><path d="M11 15.5h2l-.5 1.5h-1zM12 17c-1 1.5 1 2.5 0 4.5" /></>,
  backpack: <><path d="M6.5 9a5.5 5.5 0 0 1 11 0v10.5a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1z" /><path d="M9.5 4.6V3.5h5v1.1" /><path d="M9 13.5h6v3.5H9z" /></>,
  todo: <><rect x="5" y="4.5" width="14" height="16" rx="2" /><path d="M9 3h6v3H9z" /><path d="m8.5 13.2 2.4 2.4 4.6-4.8" /></>,
  bag: <><path d="M5 8.5h14l-1.1 11.5H6.1z" /><path d="M9 11V7a3 3 0 0 1 6 0v4" /></>,
  gift: <><rect x="4" y="10" width="16" height="10.5" rx="1" /><path d="M3 10h18M12 10v10.5" /><path d="M12 10C10.5 6 6.5 5.8 7.2 8.4 7.6 9.8 12 10 12 10zm0 0c1.5-4 5.5-4.2 4.8-1.6-.4 1.4-4.8 1.6-4.8 1.6z" /></>,
  phone: <path d="M6.5 3.5h3l1.5 4-2 1.5a11 11 0 0 0 6 6l1.5-2 4 1.5v3a2 2 0 0 1-2 2A16 16 0 0 1 4.5 5.5a2 2 0 0 1 2-2z" />,
  form: <>{DOC}<path d="M8.5 12.5h7M8.5 16h4.5" /></>,
  cancel: <>{DOC}<path d="m9.5 12 5 5m0-5-5 5" /></>,
  euro: <><circle cx="12" cy="12" r="8.5" /><path d="M15.2 8.8a4 4 0 1 0 0 6.4M7.5 11h6M7.5 13.3h6" /></>,
  dots: <><circle cx="6" cy="12" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="18" cy="12" r="1.2" /></>,
  ball: <><circle cx="12" cy="12" r="8.5" /><path d="m12 7.5 3.4 2.5-1.3 4h-4.2l-1.3-4z" /><path d="M12 3.5v4M15.4 10l3.9-1.3M14.1 14l2.4 3.4M9.9 14l-2.4 3.4M8.6 10 4.7 8.7" /></>,
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />,
  sunrise: <><path d="M12 3v3M4.9 8.9l1.4 1.4M19.1 8.9l-1.4 1.4M3 17h2M19 17h2M3 21h18" /><path d="M7 17a5 5 0 0 1 10 0" /></>,
  star: <path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z" />,
  home: <><path d="M3.5 11 12 4l8.5 7" /><path d="M5.5 9.5V20h13V9.5" /></>,
  cal: <><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
  cart: <><path d="M3 4h2l2.2 11h11l2-8H6.3" /><circle cx="9" cy="19.5" r="1.4" /><circle cx="17" cy="19.5" r="1.4" /></>,
  house: <><path d="M3.5 11 12 4l8.5 7" /><path d="M5.5 9.5V20h5v-5h3v5h5V9.5" /></>,
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
      {options.map(([id, text, aria]) => (
        <button key={id} type="button" className={value === id ? 'on' : ''} aria-pressed={value === id} aria-label={aria} title={aria} onClick={() => onPick(id)}>{text}</button>
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

// Kategorie als gezeichnetes Symbol (Name als Tooltip und für VoiceOver)
export function CatIcon({ name, label, size = 16 }) {
  return <span className="cat-icon" title={label} role="img" aria-label={label}><Icon name={name} size={size} /></span>;
}
