import { useEffect, useMemo, useState } from 'react';
import { PHASES, fmt, phaseProgress, weeksLabel } from '../lib/nutrition';
import { addDays, localDateKey } from '../lib/dates';
import { buildWeeks, summarize, weightChange } from '../lib/stats';
import { useTracking } from '../lib/useTracking';
import { StatGrid, MealTypeBreakdown, WeightPanel, AISummary, statsForAI } from './Insights';

export default function PhaseView({ profile, onClose, onOpenDay, onEditPhase }) {
  const phase = PHASES[profile.phase] || PHASES.volumen;
  const prog = phaseProgress(profile);
  const from = profile.phase_started_on || localDateKey(new Date());
  const to = localDateKey(new Date());
  const t = useTracking({ from, to, profile });
  const [open, setOpen] = useState(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const weeks = useMemo(() => buildWeeks(t.days, from).map((w) => {
    const first = w.days[0].key, last = w.days[w.days.length - 1].key;
    return { ...w, from: first, to: last, summary: summarize(w.days, profile), weight: weightChange(t.allWeights, first, last) };
  }), [t.days, t.allWeights, from, profile]);

  const startLabel = new Date(from + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'long' });
  const pGoal = profile.protein_target || 1;

  return (
    <div className="fullsheet" role="dialog" aria-modal="true" aria-label="Mi etapa">
      <div className="fullsheet-inner">
        <div className="sheet-head">
          <h2 className="h2">Mi etapa</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>

        {/* Encabezado de la etapa */}
        <section className="phase-hero">
          <div className="phase-hero-name" style={{ color: phase.color }}>{phase.label}</div>
          <div className="phase-hero-sub">
            Semana <strong>{prog.week}</strong>{prog.totalWeeks ? ` de ${prog.totalWeeks}` : ''}, desde el {startLabel}
          </div>
          <Timeline prog={prog} phase={phase} />
          <div className="phase-hero-foot tiny muted">
            {prog.next
              ? <>Después: <strong style={{ color: 'var(--text)' }}>{PHASES[prog.next].label}</strong>{prog.nextWeeks ? `, ${weeksLabel(prog.nextWeeks)}` : ''}{prog.daysLeft > 0 ? `, en ${prog.daysLeft} días` : ''}</>
              : 'Todavía no definiste qué sigue.'}
            <button className="link-btn" style={{ padding: '0 0 0 8px' }} onClick={onEditPhase}>Editar</button>
          </div>
        </section>

        {t.loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="spinner" /></div>
        ) : (
          <>
            <h3 className="h2 form-section" style={{ marginTop: 6 }}>Balance de la etapa</h3>
            <StatGrid summary={t.summary} profile={profile} />
            <WeightPanel weight={t.weight} profile={profile} />

            <h3 className="h2 form-section">Semana a semana</h3>
            {weeks.length === 0 && <p className="small muted">Todavía no hay semanas registradas.</p>}
            <div className="weeks">
              {[...weeks].reverse().slice(0, showAll ? undefined : 4).map((w) => {
                const s = w.summary;
                const isOpen = open === w.index;
                const current = w.index === prog.week;
                const grade = gradeWeek(s);
                return (
                  <div key={w.index} className={`week ${current ? 'current' : ''}`}>
                    <button className="week-head" onClick={() => setOpen(isOpen ? null : w.index)} aria-expanded={isOpen}>
                      <div className="week-title">
                        <span><strong>Semana {w.index}</strong>{current ? <span className="tag">en curso</span> : null}</span>
                        <span className="tiny muted">{rangeLabel(w.from, w.to)}</span>
                      </div>
                      <div className="week-mini" aria-hidden>
                        {w.days.map((d) => (
                          <span key={d.key} style={{
                            height: `${Math.max(8, Math.min(100, (d.protein / pGoal) * 100))}%`,
                            background: d.logged ? 'var(--protein)' : 'var(--surface-2)',
                            opacity: d.logged && d.protein < pGoal * 0.95 ? 0.55 : 1,
                          }} />
                        ))}
                      </div>
                    </button>
                    <div className="week-stats">
                      <span><b className="num" style={{ color: 'var(--protein)' }}>{fmt(s.protein)} g</b> prot</span>
                      <span><b className="num">{fmt(s.kcal)}</b> kcal</span>
                      <span><b className="num">{s.proteinHits}/{s.loggedDays}</b> días ✓</span>
                      {w.weight && <span><b className="num">{w.weight.diff > 0 ? '+' : ''}{w.weight.diff.toFixed(1).replace('.', ',')}</b> kg</span>}
                      {grade && <span className={`grade ${grade.id}`}>{grade.icon} {grade.label}</span>}
                    </div>
                    {isOpen && (
                      <div className="week-days">
                        {w.days.map((d) => (
                          <button key={d.key} className="wd" onClick={() => onOpenDay(d.date)} disabled={!d.logged}>
                            <span className="wd-date">{d.date.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric' })}</span>
                            {d.logged ? (
                              <>
                                <span className="wd-bar"><span style={{ width: `${Math.min(100, (d.protein / pGoal) * 100)}%` }} /></span>
                                <span className="num wd-p">{fmt(d.protein)} g</span>
                                <span className="num tiny muted wd-k">{fmt(d.kcal)} kcal</span>
                              </>
                            ) : <span className="tiny muted" style={{ gridColumn: '2 / -1' }}>Sin registros</span>}
                          </button>
                        ))}
                        <p className="tiny muted" style={{ margin: '8px 0 0' }}>Tocá un día para ver sus comidas.</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {weeks.length > 4 && (
              <button className="btn btn-ghost btn-block" style={{ marginTop: 10 }} onClick={() => setShowAll(!showAll)}>
                {showAll ? 'Ver menos' : `Ver las ${weeks.length - 4} semanas anteriores`}
              </button>
            )}

            {t.summary.loggedDays > 0 && (
              <>
                <div style={{ height: 14 }} />
                <MealTypeBreakdown mealTypes={t.mealTypes} perMealGoal={t.perMealGoal} />
                <AISummary profile={profile} label={`tu ${phase.label.toLowerCase()}`}
                  stats={statsForAI({ label: `etapa de ${phase.label.toLowerCase()}`, profile, perMealGoal: t.perMealGoal, ...t, weeks })} />
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Timeline({ prog, phase }) {
  const total = prog.totalWeeks;
  const next = prog.next ? PHASES[prog.next] : null;
  if (!total) {
    return <div className="timeline"><div className="tl-seg" style={{ flex: 1 }}><span style={{ width: '100%', background: phase.color }} /></div></div>;
  }
  const nextW = prog.nextWeeks || (next ? Math.round(total / 2) : 0);
  const pctDone = Math.min(100, ((prog.day) / (total * 7)) * 100);
  return (
    <div className="timeline" aria-label={`Semana ${prog.week} de ${total}`}>
      <div className="tl-seg" style={{ flex: total }}>
        <span style={{ width: `${pctDone}%`, background: phase.color }} />
        <i style={{ left: `${pctDone}%` }} />
      </div>
      {next && <div className="tl-seg next" style={{ flex: nextW }} title={next.label} />}
      <div className="tl-labels">
        <span style={{ flex: total }}>{phase.label}</span>
        {next && <span style={{ flex: nextW }}>{next.label}</span>}
      </div>
    </div>
  );
}

function gradeWeek(s) {
  if (!s.loggedDays) return { id: 'none', icon: '·', label: 'Sin datos' };
  const rate = s.proteinHits / s.loggedDays;
  if (s.loggedDays >= 4 && rate >= 0.7) return { id: 'good', icon: '▲', label: 'Muy buena' };
  if (rate >= 0.4) return { id: 'mid', icon: '■', label: 'Regular' };
  return { id: 'low', icon: '▼', label: 'Floja' };
}

function rangeLabel(a, b) {
  const o = { day: 'numeric', month: 'short' };
  const da = new Date(a + 'T12:00:00'), db = new Date(b + 'T12:00:00');
  return `${da.toLocaleDateString('es-AR', o)} al ${db.toLocaleDateString('es-AR', o)}`;
}
