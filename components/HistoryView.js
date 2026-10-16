import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { addDays, localDateKey } from '../lib/dates';
import { fmt } from '../lib/nutrition';

const RANGE = 14;

export default function HistoryView({ profile, userId, onToast }) {
  const [rows, setRows] = useState([]);
  const [weights, setWeights] = useState([]);
  const [metric, setMetric] = useState('protein');
  const [loading, setLoading] = useState(true);
  const [kg, setKg] = useState('');

  async function load() {
    const start = addDays(new Date(), -(RANGE - 1));
    start.setHours(0, 0, 0, 0);
    const [m, w] = await Promise.all([
      supabase.from('meals').select('eaten_at,kcal,protein,carbs,fat').gte('eaten_at', start.toISOString()),
      supabase.from('weights').select('logged_on,kg').order('logged_on', { ascending: false }).limit(8),
    ]);
    setRows(m.data || []);
    setWeights(w.data || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const days = useMemo(() => {
    const map = {};
    rows.forEach((r) => {
      const k = localDateKey(r.eaten_at);
      map[k] = map[k] || { kcal: 0, protein: 0 };
      map[k].kcal += Number(r.kcal) || 0;
      map[k].protein += Number(r.protein) || 0;
    });
    return Array.from({ length: RANGE }, (_, i) => {
      const d = addDays(new Date(), -(RANGE - 1 - i));
      const k = localDateKey(d);
      return { key: k, date: d, ...(map[k] || { kcal: 0, protein: 0 }), logged: !!map[k] };
    });
  }, [rows]);

  const logged = days.filter((d) => d.logged);
  const avg = (f) => (logged.length ? logged.reduce((s, d) => s + d[f], 0) / logged.length : 0);
  const pGoal = profile.protein_target || 0;
  const kGoal = profile.kcal_target || 0;
  const hits = logged.filter((d) => d.protein >= pGoal * 0.95).length;

  const goal = metric === 'protein' ? pGoal : kGoal;
  const max = Math.max(goal * 1.2, ...days.map((d) => d[metric]), 1);
  const color = metric === 'protein' ? 'var(--protein)' : 'var(--kcal)';

  async function logWeight(e) {
    e.preventDefault();
    const val = Number(kg);
    if (!val) return;
    const today = localDateKey(new Date());
    await supabase.from('weights').upsert({ user_id: userId, logged_on: today, kg: val }, { onConflict: 'user_id,logged_on' });
    await supabase.from('profiles').update({ weight_kg: val }).eq('id', userId);
    setKg('');
    onToast?.('Peso registrado');
    load();
  }

  return (
    <>
      <h1 className="h1" style={{ marginBottom: 18 }}>Historial</h1>

      <div className="segmented" style={{ marginBottom: 6 }}>
        <button className={metric === 'protein' ? 'on' : ''} onClick={() => setMetric('protein')}>Proteína</button>
        <button className={metric === 'kcal' ? 'on' : ''} onClick={() => setMetric('kcal')}>Calorías</button>
      </div>

      <div className="panel" style={{ marginTop: 12 }}>
        <div className="small muted">Últimos {RANGE} días. La línea punteada es tu objetivo ({fmt(goal)}{metric === 'protein' ? ' g' : ' kcal'}).</div>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 50 }}><div className="spinner" /></div>
        ) : (
          <>
            <div className="bars">
              {goal > 0 && <div className="goal-line" style={{ bottom: `${(goal / max) * 100}%` }} />}
              {days.map((d) => (
                <div className="bar-col" key={d.key} title={`${d.key}: ${fmt(d[metric])}`}>
                  <div className="bar" style={{
                    height: `${(d[metric] / max) * 100}%`,
                    background: d.logged ? color : 'var(--surface-2)',
                  }} />
                </div>
              ))}
            </div>
            <div className="bar-labels">
              {days.map((d) => (
                <span key={d.key} className="bar-lbl">{d.date.toLocaleDateString('es-AR', { weekday: 'narrow' })}</span>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="stat-grid">
        <div className="stat"><div className="v" style={{ color: 'var(--protein)' }}>{fmt(avg('protein'))} g</div><div className="l">Proteína promedio por día</div></div>
        <div className="stat"><div className="v">{fmt(avg('kcal'))}</div><div className="l">Kcal promedio por día</div></div>
        <div className="stat"><div className="v">{hits}/{logged.length}</div><div className="l">Días con la proteína cumplida</div></div>
        <div className="stat"><div className="v">{logged.length}</div><div className="l">Días registrados de {RANGE}</div></div>
      </div>

      <h2 className="h2" style={{ marginBottom: 10 }}>Peso</h2>
      <form className="row" onSubmit={logWeight} style={{ alignItems: 'stretch', marginBottom: 12 }}>
        <input className="input num" type="number" step="0.1" inputMode="decimal" placeholder="Peso de hoy (kg)"
          value={kg} onChange={(e) => setKg(e.target.value)} style={{ flex: 2 }} />
        <button className="btn btn-primary" disabled={!kg}>Registrar</button>
      </form>
      {weights.length > 0 ? (
        <div className="panel">
          {weights.map((w, i) => {
            const prev = weights[i + 1];
            const diff = prev ? Number(w.kg) - Number(prev.kg) : null;
            return (
              <div key={w.logged_on} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: i < weights.length - 1 ? '1px solid var(--line)' : 0 }}>
                <span className="muted">{new Date(w.logged_on + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}</span>
                <span className="num">
                  <strong>{Number(w.kg).toLocaleString('es-AR')} kg</strong>
                  {diff !== null && diff !== 0 && (
                    <span className="tiny muted" style={{ marginLeft: 8 }}>{diff > 0 ? '+' : ''}{diff.toFixed(1).replace('.', ',')}</span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="small muted">Registrá tu peso una vez por semana, en ayunas, para ver cómo evoluciona entre volumen y definición.</p>
      )}
    </>
  );
}
