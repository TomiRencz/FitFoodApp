import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { MEAL_TYPES, fmt, round1, scaleItem, sumItems, suggestMealType } from '../lib/nutrition';
import { recipeRow, recipeTotals, recipeToMealItems } from '../lib/recipes';
import { toLocalInput } from '../lib/dates';

// Detalle de receta. Si no tiene id, es una receta nueva (importada o idea) para revisar y guardar.
export default function RecipeSheet({ recipe: initial, userId, profile, onClose, onSaved, onDeleted, onLogged, onToast }) {
  const isNew = !initial.id;
  const [r, setR] = useState(initial);
  const [editing, setEditing] = useState(isNew);
  const [saving, setSaving] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [error, setError] = useState('');
  const { perServing } = useMemo(() => recipeTotals(r), [r]);
  const perMealGoal = Math.round((profile?.protein_target || 160) / (profile?.meals_per_day || 4));

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const set = (k, v) => setR((p) => ({ ...p, [k]: v }));
  function setIngGrams(idx, g) {
    setR((p) => ({ ...p, ingredients: p.ingredients.map((i, j) => (j === idx ? { ...i, grams: Math.max(0, Number(g) || 0) } : i)) }));
  }
  function removeIng(idx) { setR((p) => ({ ...p, ingredients: p.ingredients.filter((_, j) => j !== idx) })); }

  async function save() {
    if (!r.ingredients?.length) return setError('La receta necesita al menos un ingrediente.');
    setSaving(true); setError('');
    const row = recipeRow(r);
    const q = isNew
      ? supabase.from('recipes').insert({ ...row, user_id: userId }).select().single()
      : supabase.from('recipes').update(row).eq('id', r.id).select().single();
    const { data, error } = await q;
    setSaving(false);
    if (error) {
      return setError(error.message.includes('recipes') ? 'Falta crear la tabla de recetas: corré la migración 003 en Supabase.' : 'No se pudo guardar: ' + error.message);
    }
    setR(data); setEditing(false);
    onSaved?.(data, isNew ? 'Receta guardada' : 'Receta actualizada');
  }

  async function toggleFav() {
    const fav = !r.favorite;
    set('favorite', fav);
    if (!isNew) {
      await supabase.from('recipes').update({ favorite: fav }).eq('id', r.id);
      onSaved?.({ ...r, favorite: fav });
    }
  }

  async function remove() {
    if (!confirm('¿Borrar esta receta?')) return;
    await supabase.from('recipes').delete().eq('id', r.id);
    onDeleted?.(r.id);
  }

  const ok = perServing.protein >= perMealGoal * 0.9;

  return (
    <div className="fullsheet recipe-sheet" role="dialog" aria-modal="true" aria-label={r.title}>
      <div className="fullsheet-inner">
        <div className="sheet-head">
          <button className="icon-btn" onClick={onClose} aria-label="Volver">‹</button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className={`icon-btn fav ${r.favorite ? 'on' : ''}`} onClick={toggleFav} aria-label={r.favorite ? 'Quitar de favoritas' : 'Marcar como favorita'}>
              {r.favorite ? '★' : '☆'}
            </button>
            {!isNew && !editing && <button className="icon-btn" onClick={() => setEditing(true)} aria-label="Editar">✎</button>}
          </div>
        </div>

        {isNew && <div className="new-banner small">{initial.source === 'idea' ? 'Idea nueva' : 'Receta importada'}: revisala y guardala para tenerla siempre.</div>}

        {editing ? (
          <input className="input recipe-title-input" value={r.title} onChange={(e) => set('title', e.target.value)} aria-label="Nombre de la receta" />
        ) : (
          <h1 className="recipe-title">{r.title}</h1>
        )}
        <div className="recipe-meta small muted">
          {r.prep_minutes ? <span>{r.prep_minutes} min</span> : null}
          <span>{r.servings} porcion{r.servings === 1 ? '' : 'es'}</span>
          {r.style && <span>{r.style === 'lowcarb' ? 'Low carb' : 'Plato completo'}</span>}
          {(r.tags || []).map((t) => <span key={t}>{t}</span>)}
        </div>
        {r.why && <p className="note" style={{ marginTop: 12 }}>{r.why}</p>}

        {/* Macros por porción */}
        <div className="totals" style={{ marginBottom: 6 }}>
          <div><div className="v" style={{ color: 'var(--protein)' }}>{fmt(perServing.protein)}</div><div className="l">Proteína</div></div>
          <div><div className="v">{fmt(perServing.kcal)}</div><div className="l">Kcal</div></div>
          <div><div className="v" style={{ color: 'var(--carbs)' }}>{fmt(perServing.carbs)}</div><div className="l">HC</div></div>
          <div><div className="v" style={{ color: 'var(--fat)' }}>{fmt(perServing.fat)}</div><div className="l">Grasa</div></div>
        </div>
        <p className="tiny muted" style={{ marginTop: 0 }}>
          Por porción (~{fmt(perServing.grams)} g). {ok ? `Llega a los ~${perMealGoal} g de proteína por comida de tu plan.` : `Le faltan ${fmt(perMealGoal - perServing.protein)} g para los ~${perMealGoal} g por comida de tu plan.`}
        </p>

        {editing && (
          <div className="field" style={{ marginTop: 12 }}>
            <label>Porciones que rinde</label>
            <Stepper value={r.servings} min={1} onChange={(v) => set('servings', v)} />
          </div>
        )}

        <h2 className="h2 form-section">Ingredientes</h2>
        <div className="ing-list">
          {r.ingredients.map((i, idx) => (
            <div key={idx} className="ing">
              <span className="ing-name">{i.name}</span>
              {editing ? (
                <span className="ing-edit">
                  <input className="input num" type="number" inputMode="numeric" value={i.grams} onChange={(e) => setIngGrams(idx, e.target.value)} aria-label={`Gramos de ${i.name}`} />
                  <span className="tiny muted">g</span>
                  <button className="del" onClick={() => removeIng(idx)} aria-label={`Quitar ${i.name}`}>✕</button>
                </span>
              ) : (
                <span className="ing-qty small muted">{i.quantity ? `${i.quantity}, ` : ''}{fmt(i.grams)} g</span>
              )}
            </div>
          ))}
        </div>

        <h2 className="h2 form-section">Preparación</h2>
        {editing ? (
          <textarea className="textarea" style={{ minHeight: 160 }} value={(r.steps || []).join('\n')}
            onChange={(e) => set('steps', e.target.value.split('\n'))} aria-label="Pasos, uno por línea" />
        ) : (
          <ol className="steps">{(r.steps || []).map((s, i) => <li key={i}>{s}</li>)}</ol>
        )}

        {(editing || r.notes) && (
          <>
            <h2 className="h2 form-section">Notas</h2>
            {editing
              ? <textarea className="textarea" value={r.notes || ''} onChange={(e) => set('notes', e.target.value)} placeholder="Ej: le queda mejor con limón" />
              : <p className="small" style={{ whiteSpace: 'pre-wrap' }}>{r.notes}</p>}
          </>
        )}

        {error && <div className="error">{error}</div>}

        <div className="recipe-actions">
          {(isNew || editing) ? (
            <>
              <button className="btn btn-primary btn-block" onClick={save} disabled={saving}>{saving ? 'Guardando…' : isNew ? 'Guardar receta' : 'Guardar cambios'}</button>
              {editing && !isNew && <button className="btn btn-ghost btn-block" onClick={() => { setR(initial); setEditing(false); }}>Cancelar</button>}
              {isNew && <button className="btn btn-ghost btn-block" onClick={() => setLogOpen(true)}>Registrar como comida sin guardar</button>}
            </>
          ) : (
            <>
              <button className="btn btn-primary btn-block" onClick={() => setLogOpen(true)}>Registrar como comida</button>
              <button className="btn btn-danger btn-block" onClick={remove}>Borrar receta</button>
            </>
          )}
        </div>
      </div>

      {logOpen && (
        <LogMeal recipe={r} userId={userId} onClose={() => setLogOpen(false)}
          onDone={(msg) => { setLogOpen(false); onLogged?.(msg); }} />
      )}
    </div>
  );
}

// Registrar porciones de la receta como una comida
function LogMeal({ recipe, userId, onClose, onDone }) {
  const [mealType, setMealType] = useState(recipe.meal_types?.includes(suggestMealType()) ? suggestMealType() : (recipe.meal_types?.[0] || suggestMealType()));
  const [portions, setPortions] = useState(1);
  const [when, setWhen] = useState(toLocalInput(new Date()));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const items = useMemo(() => recipeToMealItems(recipe, portions), [recipe, portions]);
  const t = sumItems(items);

  async function save() {
    setSaving(true);
    const { error } = await supabase.from('meals').insert({
      user_id: userId, meal_type: mealType, eaten_at: new Date(when).toISOString(),
      title: portions === 1 ? recipe.title : `${recipe.title} (${String(portions).replace('.', ',')} porciones)`,
      items, kcal: round1(t.kcal), protein: round1(t.protein), carbs: round1(t.carbs), fat: round1(t.fat),
    });
    setSaving(false);
    if (error) return setError('No se pudo registrar: ' + error.message);
    onDone('Comida registrada');
  }

  return (
    <>
      <div className="backdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Registrar como comida">
        <div className="sheet-inner">
          <div className="grabber" />
          <div className="sheet-head"><h2 className="h2">Registrar como comida</h2><button className="icon-btn" onClick={onClose} aria-label="Cerrar">✕</button></div>
          <div className="chips">
            {MEAL_TYPES.map((m) => (
              <button key={m.id} className={`chip ${mealType === m.id ? 'on' : ''}`} onClick={() => setMealType(m.id)}>{m.emoji} {m.label}</button>
            ))}
          </div>
          <div className="field" style={{ marginTop: 16 }}>
            <label>¿Cuánto comiste?</label>
            <Stepper value={portions} min={0.5} step={0.5} onChange={setPortions} suffix={portions === 1 ? 'porción' : 'porciones'} />
          </div>
          <div className="totals">
            <div><div className="v" style={{ color: 'var(--protein)' }}>{fmt(t.protein)}</div><div className="l">Proteína</div></div>
            <div><div className="v">{fmt(t.kcal)}</div><div className="l">Kcal</div></div>
            <div><div className="v" style={{ color: 'var(--carbs)' }}>{fmt(t.carbs)}</div><div className="l">HC</div></div>
            <div><div className="v" style={{ color: 'var(--fat)' }}>{fmt(t.fat)}</div><div className="l">Grasa</div></div>
          </div>
          <div className="field">
            <label htmlFor="lw">Fecha y hora</label>
            <input id="lw" className="input" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
          </div>
          {error && <div className="error">{error}</div>}
          <button className="btn btn-primary btn-block" onClick={save} disabled={saving}>{saving ? 'Registrando…' : 'Registrar'}</button>
          <p className="tiny muted" style={{ textAlign: 'center' }}>Después la podés ajustar desde Hoy, como cualquier comida.</p>
        </div>
      </div>
    </>
  );
}

export function Stepper({ value, onChange, min = 1, step = 1, suffix }) {
  const v = Number(value) || min;
  return (
    <div className="stepper">
      <button type="button" onClick={() => onChange(Math.max(min, round1(v - step)))} aria-label="Menos">−</button>
      <span className="num">{String(v).replace('.', ',')}{suffix ? ` ${suffix}` : ''}</span>
      <button type="button" onClick={() => onChange(round1(v + step))} aria-label="Más">+</button>
    </div>
  );
}
