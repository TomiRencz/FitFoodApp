import { useState } from 'react';
import { supabase } from '../lib/supabase';

export default function AuthScreen() {
  const [mode, setMode] = useState('login'); // login | signup
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  async function submit(e) {
    e.preventDefault();
    setError('');
    setInfo('');
    setLoading(true);
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (!data.session) setInfo('Te mandamos un mail para confirmar la cuenta. Confirmala y después ingresá.');
      }
    } catch (err) {
      const msg = err?.message || '';
      if (msg.includes('Invalid login')) setError('El mail o la contraseña no coinciden.');
      else if (msg.includes('already registered')) setError('Ese mail ya tiene cuenta. Ingresá con tu contraseña.');
      else if (msg.includes('at least')) setError('La contraseña tiene que tener al menos 6 caracteres.');
      else setError(msg || 'No se pudo completar. Revisá la conexión.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth">
      <div className="wordmark">Fit<span>Food</span></div>
      <p className="muted" style={{ marginTop: 0, marginBottom: 32 }}>
        Sacale una foto a tu plato y llevá la cuenta de tu proteína y tus calorías.
      </p>

      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="email">Mail</label>
          <input id="email" className="input" type="email" autoComplete="email" required
            value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="pass">Contraseña</label>
          <input id="pass" className="input" type="password" required minLength={6}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>

        {error && <div className="error">{error}</div>}
        {info && <div className="note">{info}</div>}

        <button className="btn btn-primary btn-block" disabled={loading} style={{ marginTop: 8 }}>
          {loading ? 'Un segundo…' : mode === 'login' ? 'Ingresar' : 'Crear cuenta'}
        </button>
      </form>

      <p className="small muted" style={{ textAlign: 'center', marginTop: 18 }}>
        {mode === 'login' ? '¿Primera vez?' : '¿Ya tenés cuenta?'}
        <button className="link-btn" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); setInfo(''); }}>
          {mode === 'login' ? 'Crear cuenta' : 'Ingresar'}
        </button>
      </p>
    </div>
  );
}
