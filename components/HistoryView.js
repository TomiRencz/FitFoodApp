import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { localDateKey } from '../lib/dates';
import { fmt, PHASES } from '../lib/nutrition';
import { periodRange } from '../lib/stats';
import { useTracking } from '../lib/useTracking';
import { DayBars } from './Charts';
import { StatGrid, MacroAverages, MealTypeBreakdown, TopFoods, WeightPanel, AISummary, statsForAI } from './Insights';

const PERIODS = [
  { id: '7', label: '7 días' },
  { id: '30', label: '30 días' },
  { id: 'etapa', label: 'Etapa' },
];

export default function HistoryView({ profile, userId, onToast, onOpenDay }) {
  const [period, setPeriod] = useState('7');
  const [metric, setMetric] = useState('protein');
  const [kgInput, setKgInput] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const { from, to } = periodRange(period, profile);
  const t = useTracking({ from, to, profile, reloadKey });

  const goal = metric === 'protein' ? profile.protein_target || 0 : profile.kcal_target || 0;
  const label = period === 'etapa' ? `tu ${PHASES[profile.phase].label.toLowerCase()}` : `los últimos ${period} días`;

  async function logWeight(e) {
    e.preventDefault();
    const val = Number(kgInput);
    if (!val) return;
    await supabase.from('weights').upsert({ user_id: userId, logged_on: localDateKey(new Date()), kg: val }, { onConflict: 'user_id,logged_on' });
    await supabase.from('profiles').update({ weight_kg: val }).eq('id', userId);
    setKgInput('');
    onToast?.('Peso registrado');
    setReloadKey((k) => k + 1);
  }

  return (
    <>
      <h1 className="h1" style={{ marginBottom: 16 }}>Historial</h1>

      <div className="segmented" style={{ marginBottom: 18 }}>
        {PERIODS.map((p) => (
          <button key={p.id} className={period === p.id ? 'on' : ''} onClick={() => setPeriod(p.id)}>{p.label}</button>
        ))}
      </div>

      {t.loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="spinner" /></div>
      ) : (
        <>
          <StatGrid summary={t.summary} profile={profile} />

          <section className="panel">
            <div className="section-title" style={{ margin: 0 }}>
              <h3 className="panel-title" style={{ margin: 0 }}>Día por día</h3>
              <div className="mini-seg">
                <button className={metric === 'protein' ? 'on' : ''} onClick={() => setMetric('protein')}>Proteína</button>
                <button className={metric === 'kcal' ? 'on' : ''} onClick={() => setMetric('kcal')}>Kcal</button>
              </div>
            </div>
            <DayBars days={t.days} metric={metric} goal={goal} unit={metric === 'protein' ? ' g' : ' kcal'}
              color={metric === 'protein' ? 'var(--protein)' : 'var(--kcal)'} compactLabels={period !== '7'} />
            {t.summary.best && (
              <div className="best-worst">
                <button className="bw" onClick={() => onOpenDay?.(t.summary.best.date)}>
                  <span className="tiny muted">Mejor día</span>
                  <span><strong className="num">{fmt(t.summary.best.protein)} g</strong> <span className="muted small">{dayShort(t.summary.best.date)}</span></span>
                </button>
                {t.summary.worst && (
                  <button className="bw" onClick={() => onOpenDay?.(t.summary.worst.date)}>
                    <span className="tiny muted">Día más flojo</span>
                    <span><strong className="num">{fmt(t.summary.worst.protein)} g</strong> <span className="muted small">{dayShort(t.summary.worst.date)}</span></span>
                  </button>
                )}
              </div>
            )}
            <div style={{ marginTop: 16 }}><MacroAverages summary={t.summary} profile={profile} /></div>
          </section>

          {t.summary.loggedDays > 0 ? (
            <>
              <MealTypeBreakdown mealTypes={t.mealTypes} perMealGoal={t.perMealGoal} />
              <TopFoods foods={t.foods} />
            </>
          ) : (
            <div className="empty" style={{ marginBottom: 14 }}>
              <p><strong style={{ color: 'var(--text)' }}>No hay comidas registradas en este período.</strong></p>
              <p className="small">Cuando cargues comidas, acá vas a ver tus promedios y qué comidas se quedan cortas de proteína.</p>
            </div>
          )}

          <WeightPanel weight={t.weight} profile={profile} />
          <form className="row" onSubmit={logWeight} style={{ alignItems: 'stretch', marginBottom: 14 }}>
            <input className="input num" type="number" step="0.1" inputMode="decimal" placeholder="Peso de hoy (kg)"
              value={kgInput} onChange={(e) => setKgInput(e.target.value)} style={{ flex: 2 }} />
            <button className="btn btn-primary" disabled={!kgInput}>Registrar</button>
          </form>

          {t.summary.loggedDays > 0 && (
            <AISummary key={period} profile={profile} label={label}
              stats={statsForAI({ label, profile, perMealGoal: t.perMealGoal, ...t })} />
          )}
        </>
      )}
    </>
  );
}

const dayShort = (d) => d.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' });
