import { useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { PHASES, TRAINING_TIMES, suggestTargets } from '../lib/nutrition';
import { localDateKey } from '../lib/dates';

const EMPTY = {
  name: '', sex: 'm', age: '', height_cm: '', weight_kg: '',
  phase: 'volumen', training_time: 'tarde', protein_per_kg: 2.0, meals_per_day: 4,
  kcal_target: '', protein_target: '', carbs_target: '', fat_target: '',
};

export default function GoalsForm({ userId, profile, onSaved, onboarding = false }) {
  const [f, setF] = useState(() => ({ ...EMPTY, ...(profile || {}) }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const suggestion = useMemo(() => suggestTargets(f), [f.sex, f.age, f.height_cm, f.weight_kg, f.phase, f.protein_per_kg]);
  const targetsEmpty = !f.kcal_target && !f.protein_target;

  function applySuggestion() {
    if (!suggestion) return;
    setF((p) => ({
      ...p,
      kcal_target: suggestion.kcal,
      protein_target: suggestion.protein,
      carbs_target: suggestion.carbs,
      fat_target: suggestion.fat,
    }));
  }

  async function save(e) {
    e.preventDefault();
    setError('');
    const t = targetsEmpty && suggestion
      ? { kcal_target: suggestion.kcal, protein_target: suggestion.protein, carbs_target: suggestion.carbs, fat_target: suggestion.fat }
      : {};
    const phaseChanged = profile && profile.phase !== f.phase;
    const row = {
      id: userId,
      name: f.name || null,
      sex: f.sex,
      age: num(f.age),
      height_cm: num(f.height_cm),
      weight_kg: num(f.weight_kg),
      phase: f.phase,
      phase_started_on: phaseChanged || !profile ? localDateKey(new Date()) : profile.phase_started_on,
      training_time: f.training_time,
      protein_per_kg: num(f.protein_per_kg) || 2,
      meals_per_day: num(f.meals_per_day) || 4,
      kcal_target: num(f.kcal_target),
      protein_target: num(f.protein_target),
      carbs_target: num(f.carbs_target),
      fat_target: num(f.fat_target),
      ...t,
      updated_at: new Date().toISOString(),
    };
    if (!row.kcal_target || !row.protein_target) {
      setError('Completá tus datos o cargá los objetivos de kcal y proteína.');
      return;
    }
    setSaving(true);
    const { data, error } = await supabase.from('profiles').upsert(row).select().single();
    if (!error && row.weight_kg && (!profile || Number(profile.weight_kg) !== row.weight_kg)) {
      await supabase.from('weights').upsert(
        { user_id: userId, logged_on: localDateKey(new Date()), kg: row.weight_kg },
        { onConflict: 'user_id,logged_on' }
      );
    }
    setSaving(false);
    if (error) return setError('No se pudo guardar: ' + error.message);
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
        <label>Etapa</label>
        <div className="segmented">
          {Object.entries(PHASES).map(([id, p]) => (
            <button type="button" key={id} className={f.phase === id ? 'on' : ''} onClick={() => set('phase', id)}>
              {p.label}
            </button>
          ))}
        </div>
        <span className="tiny muted">{PHASES[f.phase]?.hint}</span>
      </div>

      <div className="field">
        <label htmlFor="tt">¿Cuándo entrenás normalmente?</label>
        <select id="tt" className="select" value={f.training_time} onChange={(e) => set('training_time', e.target.value)}>
          {Object.entries(TRAINING_TIMES).map(([id, l]) => <option key={id} value={id}>{l}</option>)}
        </select>
        <span className="tiny muted">Define qué comidas van con carbohidratos y cuáles low carb.</span>
      </div>

      <div className="row">
        <Num label="Proteína (g por kg)" value={f.protein_per_kg} onChange={(v) => set('protein_per_kg', v)} step="0.1" />
        <Num label="Comidas por día" value={f.meals_per_day} onChange={(v) => set('meals_per_day', v)} />
      </div>

      <div className="panel" style={{ marginTop: 8 }}>
        <div className="section-title" style={{ marginTop: 0 }}>
          <h2 className="h2">Objetivos diarios</h2>
          {suggestion && (
            <button type="button" className="link-btn" style={{ padding: 0 }} onClick={applySuggestion}>
              Usar sugeridos
            </button>
          )}
        </div>
        {suggestion ? (
          <p className="tiny muted" style={{ marginTop: 0 }}>
            Sugerido para {PHASES[f.phase].label.toLowerCase()}: {suggestion.kcal} kcal, {suggestion.protein} g proteína,{' '}
            {suggestion.carbs} g HC, {suggestion.fat} g grasa. Es una estimación de partida (gasto aprox. {suggestion.tdee} kcal);
            si tu nutricionista te dio otros números, poné esos.
          </p>
        ) : (
          <p className="tiny muted" style={{ marginTop: 0 }}>Completá edad, altura y peso para ver una sugerencia.</p>
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
