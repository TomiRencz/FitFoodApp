// Bloques de seguimiento reutilizados en Historial y en Mi etapa
import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { fmt, PHASES } from '../lib/nutrition';
import { EXPECTED_RATE, rateStatus } from '../lib/stats';
import { WeightLine } from './Charts';

const kg = (v) => Number(v).toLocaleString('es-AR', { maximumFractionDigits: 1 });
const signed = (v) => `${v > 0 ? '+' : ''}${kg(v)}`;

export function StatGrid({ summary, profile }) {
  const pGoal = profile.protein_target || 0;
  const kGoal = profile.kcal_target || 0;
  return (
    <div className="stat-grid">
      <Stat v={`${fmt(summary.protein)} g`} l={`Proteína promedio, objetivo ${fmt(pGoal)} g`} color="var(--protein)" pct={summary.proteinPct} />
      <Stat v={fmt(summary.kcal)} l={`Kcal promedio, objetivo ${fmt(kGoal)}`} pct={summary.kcalPct} />
      <Stat v={`${summary.proteinHits}/${summary.loggedDays}`} l="Días con la proteína cumplida" />
      <Stat v={`${summary.loggedDays}/${summary.totalDays}`} l="Días con comidas registradas" />
    </div>
  );
}

function Stat({ v, l, color, pct }) {
  return (
    <div className="stat">
      <div className="v" style={color ? { color } : undefined}>{v}</div>
      <div className="l">{l}</div>
      {pct !== null && pct !== undefined && (
        <div className="stat-pct">{Math.round(pct)} % del objetivo</div>
      )}
    </div>
  );
}

export function MacroAverages({ summary, profile }) {
  const rows = [
    { l: 'Carbohidratos', v: summary.carbs, g: profile.carbs_target, c: 'var(--carbs)' },
    { l: 'Grasas', v: summary.fat, g: profile.fat_target, c: 'var(--fat)' },
  ];
  return (
    <div className="macro-avg">
      {rows.map((r) => (
        <div key={r.l} className="macro-avg-row">
          <span className="name"><span className="dot" style={{ background: r.c }} />{r.l}</span>
          <span className="num"><strong>{fmt(r.v)} g</strong> <span className="muted">/ {r.g ? fmt(r.g) : '–'}</span></span>
          <div className="track" style={{ height: 5 }}><span style={{ width: `${r.g ? Math.min(100, (r.v / r.g) * 100) : 0}%`, background: r.c }} /></div>
        </div>
      ))}
    </div>
  );
}

export function MealTypeBreakdown({ mealTypes, perMealGoal }) {
  if (!mealTypes.length) return null;
  const weakest = [...mealTypes].filter((t) => t.count >= 2 && ['desayuno', 'almuerzo', 'merienda', 'cena'].includes(t.id))
    .sort((a, b) => a.protein - b.protein)[0];
  const maxP = Math.max(perMealGoal * 1.2, ...mealTypes.map((t) => t.protein));
  return (
    <section className="panel">
      <h3 className="panel-title">Proteína por comida</h3>
      <p className="tiny muted panel-sub">Promedio por momento del día, contra los ~{perMealGoal} g por comida de tu plan.</p>
      <div className="mt-rows">
        {mealTypes.map((t) => {
          const ok = t.protein >= perMealGoal * 0.9;
          return (
            <div key={t.id} className="mt-row">
              <span className="mt-name">{t.emoji} {t.label}</span>
              <div className="mt-bar">
                <span style={{ width: `${(t.protein / maxP) * 100}%`, background: 'var(--protein)', opacity: ok ? 1 : 0.55 }} />
                <i style={{ left: `${(perMealGoal / maxP) * 100}%` }} />
              </div>
              <span className="mt-val num">{fmt(t.protein)} g</span>
              <span className="mt-hits tiny muted">{ok ? '✓' : ''} {Math.round(t.hitPct)} % llegó, {t.count} reg.</span>
            </div>
          );
        })}
      </div>
      {weakest && weakest.protein < perMealGoal * 0.9 && (
        <p className="small panel-note">
          La comida que más se queda corta es <strong>{weakest.label.toLowerCase()}</strong>: {fmt(weakest.protein)} g en promedio, te faltan unos {fmt(perMealGoal - weakest.protein)} g.
        </p>
      )}
    </section>
  );
}

export function TopFoods({ foods }) {
  if (!foods.length) return null;
  return (
    <section className="panel">
      <h3 className="panel-title">Lo que más comiste</h3>
      <p className="tiny muted panel-sub">Con la proteína que te aporta cada vez.</p>
      <div className="foods">
        {foods.map((f) => (
          <div key={f.name} className="food-row">
            <span className="food-name">{f.name}</span>
            <span className="tiny muted num">{f.count} {f.count === 1 ? 'vez' : 'veces'}, porción típica ~{fmt(f.grams / f.count)} g</span>
            <span className="food-p num">{fmt(f.protein / f.count)} g prot</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export function WeightPanel({ weight, profile }) {
  if (!weight) {
    return (
      <section className="panel">
        <h3 className="panel-title">Peso</h3>
        <p className="small muted" style={{ margin: 0 }}>Registrá tu peso al menos dos veces en este período para ver cómo evoluciona. Lo cargás abajo.</p>
      </section>
    );
  }
  const status = rateStatus(profile.phase, weight.perWeek, weight.to);
  const exp = EXPECTED_RATE[profile.phase];
  const msg = {
    ok: 'Vas al ritmo esperado para tu etapa.',
    rapido: profile.phase === 'volumen' ? 'Estás subiendo más rápido de lo ideal: puede ser grasa de más.' : 'Estás bajando más rápido de lo ideal: cuidá no perder músculo.',
    lento: profile.phase === 'volumen' ? 'Estás subiendo más lento de lo esperado: podrías sumar algo de calorías.' : 'Estás bajando más lento de lo esperado.',
  }[status];
  return (
    <section className="panel">
      <h3 className="panel-title">Peso</h3>
      <div className="weight-head">
        <div><div className="v num">{signed(weight.diff)} kg</div><div className="tiny muted">{kg(weight.from)} → {kg(weight.to)} kg</div></div>
        <div style={{ textAlign: 'right' }}><div className="v num">{signed(weight.perWeek)}</div><div className="tiny muted">kg por semana</div></div>
      </div>
      <WeightLine points={weight.points} />
      {msg && (
        <p className="small panel-note">
          <span className={`status-dot ${status}`} aria-hidden /> {msg}
          {exp && <span className="muted"> En {PHASES[profile.phase].label.toLowerCase()} lo ideal es {exp.label}.</span>}
        </p>
      )}
    </section>
  );
}

// Resumen escrito por la IA (a pedido, para cuidar el cupo de Gemini)
export function AISummary({ stats, profile, label = 'este período' }) {
  const [state, setState] = useState({ loading: false, data: null, error: '' });
  async function generate() {
    setState({ loading: true, data: null, error: '' });
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ stats, plan: profile.plan_summary || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo generar el resumen');
      setState({ loading: false, data, error: '' });
    } catch (e) {
      setState({ loading: false, data: null, error: e.message });
    }
  }
  const { loading, data, error } = state;
  return (
    <section className="panel ai-panel">
      <div className="section-title" style={{ margin: 0 }}>
        <h3 className="panel-title" style={{ margin: 0 }}>Análisis de {label}</h3>
        {data && <button className="link-btn" style={{ padding: 0 }} onClick={generate} disabled={loading}>Rehacer</button>}
      </div>
      {!data && !loading && (
        <>
          <p className="small muted" style={{ margin: '6px 0 12px' }}>Un repaso de cómo te fue y qué ajustar, pensado para tu etapa{profile.plan_summary ? ' y tu plan' : ''}.</p>
          <button className="btn btn-ghost btn-block" onClick={generate}>Analizar {label}</button>
        </>
      )}
      {loading && <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 12 }}><span className="spinner sm" /> <span className="small muted">Analizando…</span></div>}
      {error && <div className="error">{error}</div>}
      {data && (
        <div className="ai-body">
          <p>{data.summary}</p>
          {data.wins.length > 0 && (
            <>
              <div className="ai-label">Bien</div>
              <ul>{data.wins.map((w) => <li key={w}>{w}</li>)}</ul>
            </>
          )}
          {data.focus.length > 0 && (
            <>
              <div className="ai-label">Para ajustar</div>
              <ul>{data.focus.map((w) => <li key={w}>{w}</li>)}</ul>
            </>
          )}
        </div>
      )}
    </section>
  );
}

// Datos compactos que se mandan a la IA
export function statsForAI({ label, summary, mealTypes, foods, weight, profile, perMealGoal, weeks }) {
  const r = (v) => Math.round(Number(v) || 0);
  return {
    periodo: label,
    etapa: profile.phase,
    objetivos: { proteina: profile.protein_target, kcal: profile.kcal_target, carbs: profile.carbs_target, grasa: profile.fat_target, proteina_por_comida: perMealGoal },
    dias_totales: summary.totalDays,
    dias_registrados: summary.loggedDays,
    dias_proteina_cumplida: summary.proteinHits,
    promedios: { proteina: r(summary.protein), kcal: r(summary.kcal), carbs: r(summary.carbs), grasa: r(summary.fat) },
    por_comida: mealTypes.map((t) => ({ comida: t.label, proteina_prom: r(t.protein), veces: t.count, pct_llego: r(t.hitPct) })),
    alimentos_frecuentes: foods.map((f) => ({ nombre: f.name, veces: f.count })),
    peso: weight ? { desde: weight.from, hasta: weight.to, kg_por_semana: Math.round(weight.perWeek * 100) / 100 } : null,
    semanas: weeks?.map((w) => ({ semana: w.index, proteina_prom: r(w.summary.protein), kcal_prom: r(w.summary.kcal), dias_registrados: w.summary.loggedDays })),
  };
}
