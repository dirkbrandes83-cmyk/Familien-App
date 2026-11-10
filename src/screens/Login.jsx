import { useState } from 'react';
import { supabase } from '../data.js';
import { Seg } from '../ui.jsx';

function german(msg = '') {
  if (/Invalid login credentials/i.test(msg)) return 'E-Mail oder Passwort stimmt nicht.';
  if (/Email not confirmed/i.test(msg)) return 'Bitte zuerst den Link in der Bestätigungs-Mail antippen.';
  if (/gehört nicht zur Familie|Database error saving new user/i.test(msg)) return 'Diese E-Mail-Adresse gehört nicht zur Familie.';
  if (/Password should be at least/i.test(msg)) return 'Das Passwort braucht mindestens 8 Zeichen.';
  if (/already registered/i.test(msg)) return 'Für diese Adresse gibt es schon ein Konto – bitte anmelden.';
  if (/rate limit/i.test(msg)) return 'Zu viele Versuche. Bitte kurz warten.';
  return msg;
}

export default function Login() {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const redirect = window.location.origin + window.location.pathname;

  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setOk(''); setBusy(true);
    const mail = email.trim().toLowerCase();
    let res;
    if (mode === 'login') res = await supabase.auth.signInWithPassword({ email: mail, password: pw });
    else if (mode === 'neu') {
      if (pw.length < 8) { setBusy(false); setErr('Das Passwort braucht mindestens 8 Zeichen.'); return; }
      res = await supabase.auth.signUp({ email: mail, password: pw, options: { emailRedirectTo: redirect } });
      if (!res.error) setOk(res.data.session ? '' : 'Fast geschafft: Bitte den Link in der Mail antippen und dich danach hier anmelden.');
    } else {
      res = await supabase.auth.resetPasswordForEmail(mail, { redirectTo: redirect });
      if (!res.error) setOk('Wenn die Adresse zur Familie gehört, kommt gleich eine Mail mit einem Link.');
    }
    if (res.error) setErr(german(res.error.message));
    setBusy(false);
  };

  return (
    <div className="login">
      <form className="card" onSubmit={submit}>
        <h1>Familie</h1>
        <Seg label="Anmelden oder Konto anlegen" value={mode} onPick={(m) => { setMode(m); setErr(''); setOk(''); }}
          options={[['login', 'Anmelden'], ['neu', 'Konto anlegen']]} />
        <label className="field"><span>E-Mail</span>
          <input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        {mode !== 'reset' && (
          <label className="field"><span>Passwort{mode === 'neu' ? ' (mind. 8 Zeichen)' : ''}</span>
            <input className="input" type="password" autoComplete={mode === 'neu' ? 'new-password' : 'current-password'} required value={pw} onChange={(e) => setPw(e.target.value)} />
          </label>
        )}
        {err && <div className="err" role="alert">{err}</div>}
        {ok && <div className="ok" role="status">{ok}</div>}
        <button className="btn" disabled={busy}>{mode === 'login' ? 'Anmelden' : mode === 'neu' ? 'Konto anlegen' : 'Link schicken'}</button>
        {mode === 'login' && <button type="button" className="btn ghost" onClick={() => { setMode('reset'); setErr(''); }}>Passwort vergessen</button>}
        {mode === 'reset' && <button type="button" className="btn ghost" onClick={() => setMode('login')}>Zurück</button>}
        <div className="small">Für Catrin und Dirk. Auf dem iPad mit den Zugangsdaten der Familien-Station anmelden – dann erscheint die Station.</div>
      </form>
    </div>
  );
}

export function NewPassword({ onDone }) {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const save = async (e) => {
    e.preventDefault();
    if (pw.length < 8) { setErr('Das Passwort braucht mindestens 8 Zeichen.'); return; }
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) setErr(german(error.message)); else onDone();
  };
  return (
    <div className="login">
      <form className="card" onSubmit={save}>
        <h1>Neues Passwort</h1>
        <label className="field"><span>Neues Passwort (mind. 8 Zeichen)</span>
          <input className="input" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
        </label>
        {err && <div className="err" role="alert">{err}</div>}
        <button className="btn">Speichern</button>
      </form>
    </div>
  );
}
