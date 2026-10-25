import { useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { PHASES, TRAINING_TIMES, EXPERIENCE, suggestTargets, phaseProgress, weeksLabel, fmt } from '../lib/nutrition';
import { addDays, localDateKey } from '../lib/dates';
import PlanUpload from './PlanUpload';

const EMPTY = {
  name: '', sex: 'm', age: '', height_cm: '', weight_kg: '',
  phase: 'volumen', phase_started_on: '', phase_planned_weeks: '', next_phase: '', next_phase_weeks: '',
  training_time: 'tarde', training_experience: '', protein_per_kg: 2.0, meals_per_day: 4,
  kcal_target: '', protein_target: '', carbs_target: '', fat_target: '',
  plan_summary: '', plan_source: '', plan_uploaded_at: null,
};

const today = () => localDateKey(new Date());
const monthsAgo = (m) => localDateKey(addDays(new Date(), -Math.round(m * 30.4)));

export default function GoalsForm({ userId, profile, onSaved, onboarding = false }) {
  const [f, setF] = useState(() => {
    const base = { ...EMPTY, ...(profile || {}) };
    Object.keys(base).forEach((k) => { if (base[k] === null && k !== 'plan_uploaded_at') base[k] = ''; });
    if (!base.phase_started_on) base.phase_started_on = today();
    return base;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [planNote, setPlanNote] = useState('');
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const suggestion = useMemo(() => suggestTargets(f), [f.sex, f.age, f.height_cm, f.weight_kg, f.phase, f.protein_per_kg]);
  const targetsEmpty = !f.kcal_target && !f.protein_target;
  const progress = phaseProgress(f);

  function changePhase(id) {
    setF((p) => {
      if (p.phase === id) return p;
      // Etapa nueva: por defecto arranca hoy (editable abajo)
      const startsToday = !profile || profile.phase !== id;
      return {
        ...p,
        phase: id,
        phase_started_on: startsToday ? today() : profile.phase_started_on,
        next_phase: p.next_phase === id ? '' : p.next_phase,
      };
    });
  }

  function applySuggestion() {
    if (!suggestion) return;
    setF((p) => ({
      ...p,
      kcal_target: suggestion.kcal,
      // Si la proteína vino del plan de la nutricionista, la respetamos
      protein_target: p.plan_summary && p.protein_target ? p.protein_target : suggestion.protein,
      carbs_target: suggestion.carbs,
      fat_target: suggestion.fat,
    }));
  }

  // Vuelca en el formulario lo que encontró en el plan
  function applyPlan(plan, fileName) {
    setF((p) => {
      const next = { ...p, plan_summary: plan.summary, plan_source: fileName, plan_uploaded_at: new Date().toISOString() };
      ['weight_kg', 'height_cm', 'age', 'sex', 'protein_per_kg', 'meals_per_day', 'protein_target', 'kcal_target', 'carbs_target', 'fat_target']
        .forEach((k) => { if (plan[k] !== null && plan[k] !== undefined) next[k] = plan[k]; });
      if (plan.phase && plan.phase !== p.phase) {
        next.phase = plan.phase;
        next.phase_started_on = profile?.phase === plan.phase ? profile.phase_started_on : p.phase_started_on;
      }
      // Si el plan no trae calorías, las completamos con la estimación
      const s = suggestTargets(next);
      if (s) {
        if (!plan.kcal_target) next.kcal_target = s.kcal;
        if (!plan.protein_target && !next.protein_target) next.protein_target = s.protein;
        const prot = Number(next.protein_target) || s.protein;
        if (!plan.fat_target) next.fat_target = s.fat;
        if (!plan.carbs_target) next.carbs_target = Math.max(0, Math.round((Number(next.kcal_target) - prot * 4 - Number(next.fat_target) * 9) / 4));
      }
      return next;
    });
    const found = [];
    if (plan.protein_target) found.push(`${fmt(plan.protein_target)} g de proteína por día`);
    else if (plan.protein_per_kg) found.push(`${plan.protein_per_kg} g de proteína por kg`);
    if (plan.kcal_target) found.push(`${fmt(plan.kcal_target)} kcal`);
    if (plan.meals_per_day) found.push(`${plan.meals_per_day} comidas`);
    if (plan.weight_kg) found.push(`peso ${String(plan.weight_kg).replace('.', ',')} kg`);
    setPlanNote(
      (found.length ? `Tomé del plan: ${found.join(', ')}.` : 'Guardé el plan como referencia.') +
      (plan.missing ? ` ${plan.missing} Lo que falta lo estimamos; revisalo abajo.` : '')
    );
  }

  function removePlan() {
    setF((p) => ({ ...p, plan_summary: '', plan_source: '', plan_uploaded_at: null }));
    setPlanNote('');
  }

  async function save(e) {
    e.preventDefault();
    setError('');
    const t = targetsEmpty && suggestion
      ? { kcal_target: suggestion.kcal, protein_target: suggestion.protein, carbs_target: suggestion.carbs, fat_target: suggestion.fat }
      : {};
    const row = {
      id: userId,
      name: f.name || null,
      sex: f.sex,
      age: num(f.age),
      height_cm: num(f.height_cm),
      weight_kg: num(f.weight_kg),
      phase: f.phase,
      phase_started_on: f.phase_started_on || today(),
      phase_planned_weeks: num(f.phase_planned_weeks),
      next_phase: f.next_phase || null,
      next_phase_weeks: f.next_phase ? num(f.next_phase_weeks) : null,
      training_time: f.training_time,
      training_experience: f.training_experience || null,
      protein_per_kg: num(f.protein_per_kg) || 2,
      meals_per_day: num(f.meals_per_day) || 4,
      kcal_target: num(f.kcal_target),
      protein_target: num(f.protein_target),
      carbs_target: num(f.carbs_target),
      fat_target: num(f.fat_target),
      plan_summary: f.plan_summary || null,
      plan_source: f.plan_source || null,
      plan_uploaded_at: f.plan_summary ? f.plan_uploaded_at : null,
      ...t,
      updated_at: new Date().toISOString(),
    };
    if (!row.kcal_target || !row.protein_target) {
      setError('Completá tus datos o cargá los objetivos de kcal y proteína.');
      return;
    }
    if (row.phase_started_on > today()) {
      setError('La fecha de inicio de la etapa no puede ser futura.');
      return;
    }
    setSaving(true);
    const { data, error } = await supabase.from('profiles').upsert(row).select().single();
    if (!error && row.weight_kg && (!profile || Number(profile.weight_kg) !== row.weight_kg)) {
      await supabase.from('weights').upsert(
        { user_id: userId, logged_on: today(), kg: row.weight_kg },
        { onConflict: 'user_id,logged_on' }
      );
    }
    setSaving(false);
    if (error) {
      const msg = error.message || '';
      return setError(msg.includes('column') ? 'Falta actualizar la base de datos: corré la migración 002 en Supabase.' : 'No se pudo guardar: ' + msg);
    }
    onSaved?.(data);
  }

  return (
    <form onSubmit={save}>
      {onboarding && (
        <>
          <h1 className="h1" style={{ marginBottom: 6 }}>Armemos tus objetivos</h1>
          <p className="muted" style={{ marginTop: 0, marginBottom: 24 }}>
            Con esto la app sabe en qué etapa estás y cuánto te toca comer. Lo podés cambiar cuando quieras.
          </p>
        </>
      )}

      {/* ---------- Plan de la nutricionista ---------- */}
      <PlanUpload
        source={f.plan_source}
        uploadedAt={f.plan_summary ? f.plan_uploaded_at : null}
        summary={f.plan_summary}
        note={planNote}
        onParsed={applyPlan}
        onRemove={removePlan}
      />

      {/* ---------- Datos ---------- */}
      <h2 className="h2 form-section">Tus datos</h2>
      <div className="field">
        <label htmlFor="name">Nombre</label>
        <input id="name" className="input" value={f.name || ''} onChange={(e) => set('name', e.target.value)} />
      </div>

      <div className="field">
        <label>Sexo</label>
        <div className="segmented">
          <button type="button" className={f.sex === 'm' ? 'on' : ''} onClick={() => set('sex', 'm')}>Hombre</button>
          <button type="button" className={f.sex === 'f' ? 'on' : ''} onClick={() => set('sex', 'f')}>Mujer</button>
        </div>
      </div>

      <div className="row">
        <Num label="Edad" value={f.age} onChange={(v) => set('age', v)} />
        <Num label="Altura (cm)" value={f.height_cm} onChange={(v) => set('height_cm', v)} />
        <Num label="Peso (kg)" value={f.weight_kg} onChange={(v) => set('weight_kg', v)} step="0.1" />
      </div>

      <div className="field">
        <label htmlFor="exp">¿Hace cuánto entrenás?</label>
        <select id="exp" className="select" value={f.training_experience || ''} onChange={(e) => set('training_experience', e.target.value)}>
          <option value="">Elegí una opción</option>
          {Object.entries(EXPERIENCE).map(([id, l]) => <option key={id} value={id}>{l}</option>)}
        </select>
      </div>

      <div className="field">
        <label htmlFor="tt">¿Cuándo entrenás normalmente?</label>
        <select id="tt" className="select" value={f.training_time} onChange={(e) => set('training_time', e.target.value)}>
          {Object.entries(TRAINING_TIMES).map(([id, l]) => <option key={id} value={id}>{l}</option>)}
        </select>
        <span className="tiny muted">Define qué comidas van con carbohidratos y cuáles low carb.</span>
      </div>

      {/* ---------- Etapa ---------- */}
      <h2 className="h2 form-section">Tu etapa</h2>
      <div className="field">
        <label>¿En qué etapa estás?</label>
        <div className="segmented">
          {Object.entries(PHASES).map(([id, p]) => (
            <button type="button" key={id} className={f.phase === id ? 'on' : ''} onClick={() => changePhase(id)}>
              {p.label}
            </button>
          ))}
        </div>
        <span className="tiny muted">{PHASES[f.phase]?.hint}</span>
      </div>

      <div className="field">
        <label htmlFor="since">¿Desde cuándo?</label>
        <input id="since" className="input" type="date" max={today()} value={f.phase_started_on || ''}
          onChange={(e) => set('phase_started_on', e.target.value)} />
        <div className="chips" style={{ marginTop: 4 }}>
          {[['Hoy', 0], ['Hace 1 mes', 1], ['Hace 2 meses', 2], ['Hace 3 meses', 3], ['Hace 6 meses', 6]].map(([l, m]) => (
            <button type="button" key={l} className={`chip chip-sm ${f.phase_started_on === monthsAgo(m) ? 'on' : ''}`}
              onClick={() => set('phase_started_on', m ? monthsAgo(m) : today())}>{l}</button>
          ))}
        </div>
        {progress && progress.day > 1 && (
          <span className="tiny muted">Llevás {progress.week} semana{progress.week > 1 ? 's' : ''} ({progress.day} días) de {PHASES[f.phase].label.toLowerCase()}.</span>
        )}
      </div>

      <div className="row">
        <div className="field">
          <label htmlFor="pw">Duración planificada</label>
          <select id="pw" className="select" value={f.phase_planned_weeks || ''} onChange={(e) => set('phase_planned_weeks', e.target.value)}>
            <option value="">Sin definir</option>
            {DURATIONS.map((w) => <option key={w} value={w}>{weeksLabel(w)}</option>)}
          </select>
        </div>
      </div>
      {progress?.totalWeeks && (
        <p className="tiny muted" style={{ marginTop: -6 }}>
          {progress.ended
            ? `Según lo planificado, esta etapa terminó hace ${-progress.daysLeft + 1} días.`
            : `Te quedan ${progress.daysLeft} días (semana ${progress.week} de ${progress.totalWeeks}).`}
        </p>
      )}

      <div className="row">
        <div className="field">
          <label htmlFor="np">¿Qué sigue después?</label>
          <select id="np" className="select" value={f.next_phase || ''} onChange={(e) => set('next_phase', e.target.value)}>
            <option value="">Nada definido</option>
            {Object.entries(PHASES).filter(([id]) => id !== f.phase).map(([id, p]) => <option key={id} value={id}>{p.label}</option>)}
          </select>
        </div>
        {f.next_phase && (
          <div className="field">
            <label htmlFor="nw">Durante</label>
            <select id="nw" className="select" value={f.next_phase_weeks || ''} onChange={(e) => set('next_phase_weeks', e.target.value)}>
              <option value="">Sin definir</option>
              {DURATIONS.map((w) => <option key={w} value={w}>{weeksLabel(w)}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* ---------- Objetivos ---------- */}
      <h2 className="h2 form-section">Objetivos diarios</h2>
      <div className="row">
        <Num label="Proteína (g por kg)" value={f.protein_per_kg} onChange={(v) => set('protein_per_kg', v)} step="0.1" />
        <Num label="Comidas por día" value={f.meals_per_day} onChange={(v) => set('meals_per_day', v)} />
      </div>

      <div className="panel">
        <div className="section-title" style={{ marginTop: 0 }}>
          <span className="small muted">{f.plan_summary ? 'Del plan y estimados' : 'Estimados para tu etapa'}</span>
          {suggestion && (
            <button type="button" className="link-btn" style={{ padding: 0 }} onClick={applySuggestion}>
              Recalcular
            </button>
          )}
        </div>
        {suggestion ? (
          <p className="tiny muted" style={{ marginTop: 0 }}>
            Estimación para {PHASES[f.phase].label.toLowerCase()}: {fmt(suggestion.kcal)} kcal, {suggestion.protein} g proteína,{' '}
            {suggestion.carbs} g HC, {suggestion.fat} g grasa (gasto aprox. {fmt(suggestion.tdee)} kcal).
            {f.plan_summary ? ' Recalcular respeta la proteína de tu plan.' : ' Si tu nutricionista te dio otros números, poné esos.'}
          </p>
        ) : (
          <p className="tiny muted" style={{ marginTop: 0 }}>Completá edad, altura y peso para ver una estimación.</p>
        )}
        <div className="row">
          <Num label="Kcal" value={f.kcal_target} onChange={(v) => set('kcal_target', v)} placeholder={suggestion?.kcal} />
          <Num label="Proteína (g)" value={f.protein_target} onChange={(v) => set('protein_target', v)} placeholder={suggestion?.protein} />
        </div>
        <div className="row">
          <Num label="Carbohidratos (g)" value={f.carbs_target} onChange={(v) => set('carbs_target', v)} placeholder={suggestion?.carbs} />
          <Num label="Grasas (g)" value={f.fat_target} onChange={(v) => set('fat_target', v)} placeholder={suggestion?.fat} />
        </div>
      </div>

      {error && <div className="error">{error}</div>}
      <button className="btn btn-primary btn-block" disabled={saving}>
        {saving ? 'Guardando…' : onboarding ? 'Empezar' : 'Guardar objetivos'}
      </button>
    </form>
  );
}

const DURATIONS = [4, 6, 8, 10, 12, 16, 20, 24, 36, 48];

function Num({ label, value, onChange, step = '1', placeholder }) {
  return (
    <div className="field">
      <label>{label}</label>
      <input className="input num" type="number" inputMode="decimal" step={step} placeholder={placeholder ? String(placeholder) : ''}
        value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

const num = (v) => (v === '' || v === null || v === undefined ? null : Number(v));
