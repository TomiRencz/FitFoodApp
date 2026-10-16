import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { compressImage } from '../lib/image';
import { MEAL_TYPES, mealStyle, scaleItem, sumItems, suggestMealType, fmt, round1 } from '../lib/nutrition';
import { toLocalInput } from '../lib/dates';

export default function MealEditor({ profile, userId, meal, photoUrl, defaultDate, dayTotals, onClose, onSaved, onDeleted }) {
  const editing = !!meal;
  const [step, setStep] = useState(editing ? 'review' : 'capture'); // capture | analyzing | review
  const [mealType, setMealType] = useState(meal?.meal_type || suggestMealType());
  const [eatenAt, setEatenAt] = useState(toLocalInput(meal?.eaten_at || defaultDate || new Date()));
  const [photo, setPhoto] = useState(null); // { dataUrl, base64, blob }
  const [text, setText] = useState('');
  const [title, setTitle] = useState(meal?.title || '');
  const [items, setItems] = useState(meal?.items || []);
  const [feedback, setFeedback] = useState(meal?.ai_feedback || '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);

  // Bloquea el scroll del fondo mientras está abierta la hoja
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const totals = useMemo(() => sumItems(items), [items]);
  const style = mealStyle(profile?.training_time, mealType);
  const proteinPerMeal = Math.round((profile?.protein_target || 160) / (profile?.meals_per_day || 4));
  const shownPhoto = photo?.dataUrl || photoUrl;

  async function onPick(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    try {
      setPhoto(await compressImage(file));
    } catch {
      setError('No se pudo leer la foto. Probá con otra.');
    }
  }

  async function analyze() {
    if (!photo && !text.trim()) return setError('Sacá una foto o describí lo que comiste.');
    setError('');
    setStep('analyzing');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const base = dayTotals || { kcal: 0, protein: 0 };
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          image: photo?.base64,
          text: text.trim() || undefined,
          mealType,
          context: {
            phase: profile?.phase,
            proteinPerMeal,
            style: style ? `${style.label} (${style.desc})` : undefined,
            remaining: profile ? {
              kcal: (profile.kcal_target || 0) - base.kcal,
              protein: (profile.protein_target || 0) - base.protein,
            } : undefined,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo analizar');
      if (!data.is_food || !data.items.length) {
        setStep('capture');
        return setError('No encontré comida en la foto. Probá con otra foto o describila en texto.');
      }
      setItems(data.items);
      setTitle(data.title);
      setFeedback(data.feedback);
      setStep('review');
    } catch (e) {
      setStep('capture');
      setError(e.message);
    }
  }

  function updateGrams(idx, grams) {
    setItems((list) => list.map((it, i) => (i === idx ? scaleItem(it, grams) : it)));
  }
  function updateName(idx, name) {
    setItems((list) => list.map((it, i) => (i === idx ? { ...it, name } : it)));
  }
  function removeItem(idx) {
    setItems((list) => list.filter((_, i) => i !== idx));
  }

  async function save() {
    if (!items.length) return setError('Agregá al menos un alimento.');
    setSaving(true);
    setError('');
    try {
      let photo_path = meal?.photo_path || null;
      if (photo?.blob) {
        const path = `${userId}/${crypto.randomUUID()}.jpg`;
        const { error: upErr } = await supabase.storage.from('meal-photos').upload(path, photo.blob, { contentType: 'image/jpeg' });
        if (upErr) throw upErr;
        if (meal?.photo_path) await supabase.storage.from('meal-photos').remove([meal.photo_path]);
        photo_path = path;
      }
      const row = {
        meal_type: mealType,
        eaten_at: new Date(eatenAt).toISOString(),
        title: title.trim() || 'Comida',
        items,
        kcal: round1(totals.kcal),
        protein: round1(totals.protein),
        carbs: round1(totals.carbs),
        fat: round1(totals.fat),
        photo_path,
        ai_feedback: feedback || null,
      };
      const q = editing
        ? supabase.from('meals').update(row).eq('id', meal.id)
        : supabase.from('meals').insert({ ...row, user_id: userId });
      const { error: dbErr } = await q;
      if (dbErr) throw dbErr;
      onSaved?.(editing ? 'Comida actualizada' : 'Comida guardada');
    } catch (e) {
      setError('No se pudo guardar: ' + (e.message || 'error desconocido'));
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm('¿Borrar esta comida?')) return;
    setSaving(true);
    await supabase.from('meals').delete().eq('id', meal.id);
    if (meal.photo_path) await supabase.storage.from('meal-photos').remove([meal.photo_path]);
    onDeleted?.('Comida borrada');
  }

  return (
    <>
      <div className="backdrop" onClick={step === 'analyzing' || saving ? undefined : onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Cargar comida">
        <div className="sheet-inner">
          <div className="grabber" />
          <div className="sheet-head">
            <h2 className="h2">{editing ? 'Editar comida' : step === 'review' ? 'Revisá y guardá' : 'Cargar comida'}</h2>
            <button className="icon-btn" onClick={onClose} aria-label="Cerrar" disabled={step === 'analyzing'}>✕</button>
          </div>

          <div className="chips" role="radiogroup" aria-label="Momento del día">
            {MEAL_TYPES.map((m) => (
              <button key={m.id} type="button" className={`chip ${mealType === m.id ? 'on' : ''}`} onClick={() => setMealType(m.id)}>
                {m.emoji} {m.label}
              </button>
            ))}
          </div>
          {style && (
            <div className="style-hint">
              Según tu plan esta comida va <b>{style.label.toLowerCase()}</b>: {style.desc.toLowerCase()}.
            </div>
          )}

          {/* ---------- Paso 1: foto o texto ---------- */}
          {step !== 'review' && (
            <>
              {shownPhoto ? (
                <div className={`preview ${step === 'analyzing' ? 'scanning' : ''}`}>
                  <img src={shownPhoto} alt="Tu comida" />
                  {step !== 'analyzing' && <button className="x" onClick={() => setPhoto(null)} aria-label="Quitar foto">✕</button>}
                </div>
              ) : (
                <div className="photo-pick">
                  <label className="cam">
                    <span className="ico">📷</span>Sacar foto
                    <input type="file" accept="image/*" capture="environment" onChange={onPick} />
                  </label>
                  <label className="gal">
                    <span className="ico">🖼️</span>Galería
                    <input type="file" accept="image/*" onChange={onPick} />
                  </label>
                </div>
              )}

              <div className="field">
                <label htmlFor="desc">{shownPhoto ? 'Aclaraciones (opcional)' : 'O describí lo que comiste'}</label>
                <textarea id="desc" className="textarea" disabled={step === 'analyzing'}
                  placeholder={shownPhoto ? 'Ej: la milanesa es de pollo, 2 cucharadas de aceite' : 'Ej: 3 huevos revueltos, 2 tostadas integrales y media palta'}
                  value={text} onChange={(e) => setText(e.target.value)} />
              </div>

              {error && <div className="error">{error}</div>}

              <button className="btn btn-primary btn-block" onClick={analyze} disabled={step === 'analyzing' || (!photo && !text.trim())}>
                {step === 'analyzing' ? 'Analizando tu plato…' : 'Analizar'}
              </button>
              <button className="link-btn" style={{ display: 'block', margin: '10px auto 0' }} disabled={step === 'analyzing'}
                onClick={() => { setStep('review'); setAdding(true); }}>
                Cargar a mano
              </button>
            </>
          )}

          {/* ---------- Paso 2: revisión ---------- */}
          {step === 'review' && (
            <>
              {shownPhoto && (
                <div className="preview"><img src={shownPhoto} alt="Tu comida" style={{ maxHeight: 180 }} /></div>
              )}

              <div className="field" style={{ marginTop: shownPhoto ? 0 : 14 }}>
                <label htmlFor="title">Nombre</label>
                <input id="title" className="input" value={title} placeholder="Ej: Pollo con arroz" onChange={(e) => setTitle(e.target.value)} />
              </div>

              <div className="totals">
                <Tot v={fmt(totals.protein)} l="Proteína" color="var(--protein)" />
                <Tot v={fmt(totals.kcal)} l="Kcal" />
                <Tot v={fmt(totals.carbs)} l="HC" color="var(--carbs)" />
                <Tot v={fmt(totals.fat)} l="Grasa" color="var(--fat)" />
              </div>
              <ProteinGoal value={totals.protein} goal={proteinPerMeal} />

              {feedback && <div className="note">{feedback}</div>}

              <div className="section-title">
                <h2 className="h2">Alimentos</h2>
                <span className="tiny muted">Ajustá los gramos si hace falta</span>
              </div>
              <div>
                {items.map((it, i) => (
                  <div className="item" key={i}>
                    <div className="item-top">
                      <input className="item-name" value={it.name} onChange={(e) => updateName(i, e.target.value)} aria-label="Nombre del alimento" />
                      <button className="del" onClick={() => removeItem(i)} aria-label="Quitar alimento">✕</button>
                    </div>
                    <div className="item-bottom">
                      <div className="item-macros">
                        <span><b style={{ color: 'var(--protein)' }}>{fmt(it.protein)} g</b> prot</span>
                        <span><b>{fmt(it.kcal)}</b> kcal</span>
                        <span><b>{fmt(it.carbs)}</b> HC</span>
                        <span><b>{fmt(it.fat)}</b> grasa</span>
                      </div>
                      <div className="item-grams">
                        <button type="button" onClick={() => updateGrams(i, Math.max(0, it.grams - (it.grams <= 50 ? 5 : 10)))} aria-label="Restar 10 gramos">−</button>
                        <input className="num" type="number" inputMode="numeric" value={it.grams}
                          onChange={(e) => updateGrams(i, e.target.value)} aria-label="Gramos" />
                        <span>g</span>
                        <button type="button" onClick={() => updateGrams(i, it.grams + (it.grams < 50 ? 5 : 10))} aria-label="Sumar 10 gramos">+</button>
                      </div>
                    </div>
                    {it.confidence && it.confidence !== 'alta' && (
                      <span className={`conf ${it.confidence}`}>{it.confidence === 'baja' ? 'Revisá este alimento' : 'Porción estimada'}</span>
                    )}
                  </div>
                ))}
              </div>

              {adding ? (
                <ManualItem onAdd={(it) => { setItems((l) => [...l, it]); setAdding(false); }} onCancel={() => setAdding(false)} />
              ) : (
                <button className="btn btn-ghost btn-block" style={{ marginTop: 12 }} onClick={() => setAdding(true)}>
                  Agregar alimento
                </button>
              )}

              <div className="field" style={{ marginTop: 18 }}>
                <label htmlFor="when">Fecha y hora</label>
                <input id="when" className="input" type="datetime-local" value={eatenAt} onChange={(e) => setEatenAt(e.target.value)} />
              </div>

              {error && <div className="error">{error}</div>}

              <button className="btn btn-primary btn-block" onClick={save} disabled={saving}>
                {saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Guardar comida'}
              </button>
              {!editing && (
                <button className="link-btn" style={{ display: 'block', margin: '10px auto 0' }} onClick={() => { setStep('capture'); setError(''); }}>
                  Volver a analizar
                </button>
              )}
              {editing && (
                <button className="btn btn-danger btn-block" style={{ marginTop: 10 }} onClick={remove} disabled={saving}>
                  Borrar comida
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

function Tot({ v, l, color }) {
  return (
    <div>
      <div className="v" style={color ? { color } : undefined}>{v}</div>
      <div className="l">{l}</div>
    </div>
  );
}

function ProteinGoal({ value, goal }) {
  const pct = Math.min(100, (value / goal) * 100);
  const diff = Math.round(goal - value);
  return (
    <div style={{ marginBottom: 6 }}>
      <div className="track" style={{ height: 6 }}><span style={{ width: `${pct}%`, background: 'var(--protein)' }} /></div>
      <div className="tiny muted" style={{ marginTop: 6 }}>
        {diff > 0 ? `${diff} g por debajo de los ~${goal} g de proteína por comida` : `Llegaste a los ~${goal} g de proteína de esta comida`}
      </div>
    </div>
  );
}

// Alta manual: el usuario carga los valores de la porción y los guardamos cada 100 g
function ManualItem({ onAdd, onCancel }) {
  const [m, setM] = useState({ name: '', grams: 100, kcal: '', protein: '', carbs: '', fat: '' });
  const set = (k, v) => setM((p) => ({ ...p, [k]: v }));
  function add() {
    const g = Number(m.grams) || 0;
    if (!m.name.trim() || !g) return;
    const per100 = (v) => round1(((Number(v) || 0) / g) * 100);
    onAdd(scaleItem({
      name: m.name.trim(), confidence: 'alta',
      kcal_100: per100(m.kcal), protein_100: per100(m.protein), carbs_100: per100(m.carbs), fat_100: per100(m.fat),
    }, g));
  }
  return (
    <div className="panel" style={{ marginTop: 12 }}>
      <div className="row">
        <div className="field" style={{ flex: 2 }}>
          <label>Alimento</label>
          <input className="input" value={m.name} onChange={(e) => set('name', e.target.value)} placeholder="Ej: Yogur proteico" />
        </div>
        <MiniNum label="Gramos" v={m.grams} on={(v) => set('grams', v)} />
      </div>
      <p className="tiny muted" style={{ margin: '0 0 8px' }}>Valores de esa porción (los ves en la etiqueta):</p>
      <div className="row">
        <MiniNum label="Kcal" v={m.kcal} on={(v) => set('kcal', v)} />
        <MiniNum label="Prot" v={m.protein} on={(v) => set('protein', v)} />
        <MiniNum label="HC" v={m.carbs} on={(v) => set('carbs', v)} />
        <MiniNum label="Grasa" v={m.fat} on={(v) => set('fat', v)} />
      </div>
      <div className="row">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancelar</button>
        <button type="button" className="btn btn-primary" onClick={add}>Agregar</button>
      </div>
    </div>
  );
}

function MiniNum({ label, v, on }) {
  return (
    <div className="field">
      <label>{label}</label>
      <input className="input num" type="number" inputMode="decimal" value={v} onChange={(e) => on(e.target.value)} style={{ padding: '10px 8px' }} />
    </div>
  );
}
