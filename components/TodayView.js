import { useState } from 'react';
import { PHASES, mealTypeById, fmt, phaseProgress, weeksLabel } from '../lib/nutrition';
import { addDays, dayLabel, isToday, timeLabel } from '../lib/dates';

export default function TodayView({ profile, meals, totals, photoUrls, date, setDate, onOpenMeal, loading, onAdvancePhase, onOpenPhase }) {
  const phase = PHASES[profile.phase] || PHASES.volumen;
  const prog = phaseProgress(profile);
  const [advancing, setAdvancing] = useState(false);
  const pGoal = profile.protein_target || 1;
  const pLeft = Math.round(pGoal - totals.protein);
  const kLeft = Math.round((profile.kcal_target || 0) - totals.kcal);

  return (
    <>
      <div className="topbar">
        <div className="daynav">
          <button className="icon-btn" onClick={() => setDate(addDays(date, -1))} aria-label="Día anterior">‹</button>
          <span className="label">{dayLabel(date)}</span>
          <button className="icon-btn" onClick={() => setDate(addDays(date, 1))} disabled={isToday(date)}
            style={{ opacity: isToday(date) ? 0.3 : 1 }} aria-label="Día siguiente">›</button>
        </div>
        <button className="phase-badge" style={{ color: phase.color }} onClick={onOpenPhase} aria-label="Ver mi etapa">
          {phase.emoji} {phase.label}, semana {prog.week} <span className="chev" aria-hidden>›</span>
        </button>
      </div>

      {/* Progreso de la etapa */}
      {(prog.totalWeeks || prog.next) && !prog.ended && (
        <div className="phase-strip">
          <div className="phase-strip-top">
            <span>
              {prog.totalWeeks
                ? <>Semana <strong>{prog.week}</strong> de {prog.totalWeeks}</>
                : <>Día {prog.day} de {phase.label.toLowerCase()}</>}
            </span>
            {prog.next && (
              <span className="muted">
                Después: {PHASES[prog.next].label.toLowerCase()}
                {prog.daysLeft !== null ? ` en ${prog.daysLeft} día${prog.daysLeft === 1 ? '' : 's'}` : ''}
              </span>
            )}
          </div>
          {prog.pct !== null && (
            <div className="track"><span style={{ width: `${prog.pct}%`, background: phase.color }} /></div>
          )}
        </div>
      )}

      {/* La etapa terminó según lo planificado */}
      {prog.ended && isToday(date) && (
        <div className="phase-next">
          <strong>Terminaste las {prog.totalWeeks} semanas de {phase.label.toLowerCase()}.</strong>
          {prog.next ? (
            <>
              <p className="small muted">
                Según tu plan sigue {PHASES[prog.next].label.toLowerCase()}
                {prog.nextWeeks ? ` durante ${weeksLabel(prog.nextWeeks)}` : ''}. Al pasar, recalculamos tus calorías y mantenemos tu proteína.
              </p>
              <button className="btn btn-primary btn-block" disabled={advancing}
                onClick={async () => { setAdvancing(true); await onAdvancePhase?.(); setAdvancing(false); }}>
                {advancing ? 'Actualizando…' : `Empezar ${PHASES[prog.next].label.toLowerCase()}`}
              </button>
            </>
          ) : (
            <p className="small muted" style={{ marginBottom: 0 }}>
              Si seguís en esta etapa o pasás a otra, actualizalo en Ajustes.
            </p>
          )}
        </div>
      )}

      <section className="hero" aria-label="Proteína del día">
        <div className="hero-num">
          <span className="big">{fmt(totals.protein)}</span>
          <span className="of num">/ {fmt(pGoal)} g proteína</span>
        </div>
        <div className="track">
          <span style={{ width: `${Math.min(100, (totals.protein / pGoal) * 100)}%`, background: 'var(--protein)' }} />
        </div>
        <div className="hero-sub">
          {pLeft > 0
            ? <>Te faltan <strong>{pLeft} g</strong> de proteína{isToday(date) ? ' para hoy' : ''}.</>
            : <>Objetivo de proteína cumplido. <strong>Bien ahí.</strong></>}
        </div>
      </section>

      <div className="macros">
        <Macro name="Kcal" color="var(--kcal)" value={totals.kcal} goal={profile.kcal_target} unit="" />
        <Macro name="Carbohidratos" color="var(--carbs)" value={totals.carbs} goal={profile.carbs_target} unit="g" />
        <Macro name="Grasas" color="var(--fat)" value={totals.fat} goal={profile.fat_target} unit="g" />
      </div>
      {profile.kcal_target && totals.kcal > 0 && (
        <p className="small muted" style={{ marginTop: -14, marginBottom: 22 }}>
          {kLeft >= 0
            ? `Quedan ${fmt(kLeft)} kcal disponibles.`
            : profile.phase === 'definicion'
              ? `Te pasaste ${fmt(-kLeft)} kcal del objetivo de definición.`
              : `${fmt(-kLeft)} kcal por encima del objetivo.`}
        </p>
      )}

      <div className="section-title">
        <h2 className="h2">Comidas</h2>
        <span className="tiny muted">{meals.length ? `${meals.length} registrada${meals.length > 1 ? 's' : ''}` : ''}</span>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}><div className="spinner" /></div>
      ) : meals.length === 0 ? (
        <div className="empty">
          <p style={{ fontSize: 30 }}>🍽️</p>
          <p><strong style={{ color: 'var(--text)' }}>Todavía no cargaste comidas {isToday(date) ? 'hoy' : 'este día'}.</strong></p>
          <p className="small">Sacale una foto a tu próximo plato con el botón de abajo.</p>
        </div>
      ) : (
        <div className="meal-list">
          {meals.map((m) => {
            const t = mealTypeById(m.meal_type);
            const url = photoUrls[m.photo_path];
            return (
              <button key={m.id} className="meal" onClick={() => onOpenMeal(m)}>
                {url ? <img className="meal-thumb" src={url} alt="" /> : <span className="meal-thumb">{t.emoji}</span>}
                <span className="meal-body">
                  <span className="meal-title" style={{ display: 'block' }}>{m.title || t.label}</span>
                  <span className="meal-meta" style={{ display: 'block' }}>{t.label}, {timeLabel(m.eaten_at)}</span>
                </span>
                <span className="meal-prot">
                  <span className="p" style={{ display: 'block' }}>{fmt(m.protein)} g</span>
                  <span className="k" style={{ display: 'block' }}>{fmt(m.kcal)} kcal</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

function Macro({ name, color, value, goal, unit }) {
  const pct = goal ? Math.min(100, (value / goal) * 100) : 0;
  const over = goal && value > goal * 1.05;
  return (
    <div className="macro">
      <div className="name"><span className="dot" style={{ background: color }} />{name}</div>
      <div className={`val ${over ? 'over' : ''}`}>
        {fmt(value)}{unit && <small> {unit}</small>} <small>/ {goal ? fmt(goal) : '–'}</small>
      </div>
      <div className="track"><span style={{ width: `${pct}%`, background: over ? 'var(--danger)' : color }} /></div>
    </div>
  );
}
