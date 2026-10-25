import { useState } from 'react';
import { fmt } from '../lib/nutrition';

// Barras por día con línea de objetivo. Tocar una barra muestra su valor.
export function DayBars({ days, metric, goal, color, unit = '', onSelect, compactLabels }) {
  const [sel, setSel] = useState(null);
  const max = Math.max(goal * 1.15 || 0, ...days.map((d) => d[metric]), 1);
  const many = days.length > 14;
  const active = sel !== null ? days[sel] : null;

  return (
    <div className="daybars">
      <div className="daybars-readout" aria-live="polite">
        {active
          ? <><strong>{fmt(active[metric])}{unit}</strong> <span className="muted">{active.date.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'short' })}{!active.logged ? ', sin registros' : ''}</span></>
          : <span className="muted">Tocá una barra para ver el día</span>}
      </div>
      <div className="bars" style={{ gap: many ? 2 : 5 }}>
        {goal > 0 && (
          <div className="goal-line" style={{ bottom: `${(goal / max) * 100}%` }}>
            <span>{fmt(goal)}{unit}</span>
          </div>
        )}
        {days.map((d, i) => (
          <button key={d.key} type="button" className={`bar-col ${sel === i ? 'sel' : ''}`}
            aria-label={`${d.key}: ${fmt(d[metric])}${unit}`}
            onClick={() => { setSel(sel === i ? null : i); onSelect?.(d); }}>
            <span className="bar" style={{
              height: `${(d[metric] / max) * 100}%`,
              background: d.logged ? color : 'var(--surface-2)',
              borderRadius: many ? '3px 3px 1px 1px' : undefined,
            }} />
          </button>
        ))}
      </div>
      <div className="bar-labels" style={{ gap: many ? 2 : 5 }}>
        {days.map((d, i) => (
          <span key={d.key} className="bar-lbl">
            {many
              ? (i % 7 === 0 || i === days.length - 1 ? d.date.getDate() : '')
              : compactLabels ? d.date.getDate() : d.date.toLocaleDateString('es-AR', { weekday: 'narrow' })}
          </span>
        ))}
      </div>
    </div>
  );
}

// Línea de peso (SVG). Un solo eje, puntos tocables.
export function WeightLine({ points }) {
  const [sel, setSel] = useState(points.length - 1);
  if (points.length < 2) return null;
  const W = 340, H = 120, P = { l: 8, r: 8, t: 14, b: 18 };
  const kgs = points.map((p) => Number(p.kg));
  let lo = Math.min(...kgs), hi = Math.max(...kgs);
  if (hi - lo < 1) { const mid = (hi + lo) / 2; lo = mid - 0.5; hi = mid + 0.5; }
  const t0 = new Date(points[0].logged_on).getTime();
  const t1 = new Date(points[points.length - 1].logged_on).getTime();
  const x = (p) => P.l + ((new Date(p.logged_on).getTime() - t0) / Math.max(1, t1 - t0)) * (W - P.l - P.r);
  const y = (kg) => P.t + (1 - (kg - lo) / (hi - lo)) * (H - P.t - P.b);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(p).toFixed(1)},${y(Number(p.kg)).toFixed(1)}`).join(' ');
  const active = points[sel];
  const fmtDate = (s) => new Date(s + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });

  return (
    <div className="weightline">
      <div className="daybars-readout">
        <strong>{Number(active.kg).toLocaleString('es-AR')} kg</strong> <span className="muted">{fmtDate(active.logged_on)}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Evolución del peso">
        <line x1={P.l} x2={W - P.r} y1={y(hi)} y2={y(hi)} className="grid" />
        <line x1={P.l} x2={W - P.r} y1={y(lo)} y2={y(lo)} className="grid" />
        <path d={path} fill="none" stroke="var(--fat)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (
          <g key={p.logged_on} onClick={() => setSel(i)} style={{ cursor: 'pointer' }}>
            <circle cx={x(p)} cy={y(Number(p.kg))} r="14" fill="transparent" />
            <circle cx={x(p)} cy={y(Number(p.kg))} r={i === sel ? 5 : 3.5} fill={i === sel ? 'var(--text)' : 'var(--fat)'} stroke="var(--surface)" strokeWidth="2" />
          </g>
        ))}
        <text x={P.l} y={H - 4} className="axis">{fmtDate(points[0].logged_on)}</text>
        <text x={W - P.r} y={H - 4} className="axis" textAnchor="end">{fmtDate(points[points.length - 1].logged_on)}</text>
      </svg>
    </div>
  );
}

// Medidor horizontal simple (valor vs objetivo)
export function Meter({ value, goal, color }) {
  const pct = goal ? Math.min(100, (value / goal) * 100) : 0;
  return <div className="track" style={{ height: 6 }}><span style={{ width: `${pct}%`, background: color }} /></div>;
}
