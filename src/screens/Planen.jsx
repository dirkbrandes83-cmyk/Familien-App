import Wochenplan from './Wochenplan.jsx';
import Ideenkiste from './Wochenende.jsx';
import Geschenke from './Geschenke.jsx';
import Dauerkarten from './Dauerkarten.jsx';
import { Essen } from './Zuhause.jsx';
import { CheckinVerlauf } from './Mehr.jsx';
import { weekendDays } from '../lib/wochenende.js';
import { Icon, Seg } from '../ui.jsx';

// Planen: alles, was man vorausdenkt – Wochenende, Essen, Geschenke, Check-in, Werder
const BEREICHE = [
  ['wochenende', 'Freizeit', 'balloon'],
  ['essen', 'Essen', 'clock'],
  ['geschenke', 'Geschenke', 'gift'],
  ['checkin', 'Check-in', 'sun'],
  ['werder', 'Werder', 'ball'],
];

export default function Planen({ ctx, seg: seg0, setSeg }) {
  const seg = BEREICHE.some((b) => b[0] === seg0) ? seg0 : 'wochenende';
  return (
    <>
      <div className="li-seg"><Seg label="Bereich" value={seg} onPick={setSeg}
        options={BEREICHE.map(([id, label, icon]) => [id, <span key={id} className="seg-txt" aria-hidden="true"><Icon name={icon} size={20} />{label}</span>, label])} /></div>
      {seg === 'wochenende' && <><Wochenplan ctx={ctx} days={weekendDays(ctx.day)} onKiste={() => document.querySelector('.wk')?.scrollIntoView({ behavior: 'smooth' })} /><Ideenkiste ctx={ctx} /></>}
      {seg === 'essen' && <Essen ctx={ctx} />}
      {seg === 'geschenke' && <Geschenke ctx={ctx} />}
      {seg === 'checkin' && <CheckinVerlauf ctx={ctx} />}
      {seg === 'werder' && <Dauerkarten ctx={ctx} />}
    </>
  );
}
