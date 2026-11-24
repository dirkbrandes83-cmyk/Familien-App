import Wochenplan from './Wochenplan.jsx';
import Ideenkiste from './Wochenende.jsx';
import Geschenke from './Geschenke.jsx';
import Dauerkarten from './Dauerkarten.jsx';
import { Essen } from './Zuhause.jsx';
import { CheckinVerlauf } from './Mehr.jsx';
import { weekendDays } from '../lib/wochenende.js';
import { Icon } from '../ui.jsx';

// Planen: alles, was man vorausdenkt – Wochenende, Essen, Geschenke, Check-in, Werder
const BEREICHE = [
  ['wochenende', 'Wochenende', 'balloon'],
  ['essen', 'Essen', 'clock'],
  ['geschenke', 'Geschenke', 'gift'],
  ['checkin', 'Check-in', 'sun'],
  ['werder', 'Werder', 'ball'],
];

export default function Planen({ ctx, seg: seg0, setSeg }) {
  const seg = BEREICHE.some((b) => b[0] === seg0) ? seg0 : 'wochenende';
  return (
    <>
      <div className="pl-chips" role="group" aria-label="Bereich">
        {BEREICHE.map(([id, label, icon]) => (
          <button key={id} className={`pl-chip${seg === id ? ' on' : ''}`} aria-pressed={seg === id} onClick={() => setSeg(id)}>
            <Icon name={icon} size={16} />{label}
          </button>
        ))}
      </div>
      {seg === 'wochenende' && <><Wochenplan ctx={ctx} days={weekendDays(ctx.day)} onKiste={() => document.querySelector('.wk')?.scrollIntoView({ behavior: 'smooth' })} /><Ideenkiste ctx={ctx} /></>}
      {seg === 'essen' && <Essen ctx={ctx} />}
      {seg === 'geschenke' && <Geschenke ctx={ctx} />}
      {seg === 'checkin' && <CheckinVerlauf ctx={ctx} />}
      {seg === 'werder' && <Dauerkarten ctx={ctx} />}
    </>
  );
}
