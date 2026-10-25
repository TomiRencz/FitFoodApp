import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { fmt, mealTypeById } from '../lib/nutrition';
import { addDays, dayLabel, localDateKey, timeLabel } from '../lib/dates';

const PAGE = 150;

export default function RecordsView({ userId, onClose, onOpenMeal, reloadKey, onToast, onChanged }) {
  const [tab, setTab] = useState('comidas');
  const [meals, setMeals] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [photoUrls, setPhotoUrls] = useState({});
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const [cleanOpen, setCleanOpen] = useState(false);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  async function load(offset = 0) {
    setLoading(true);
    const { data } = await supabase.from('meals').select('id,eaten_at,meal_type,title,kcal,protein,carbs,fat,items,photo_path,ai_feedback')
      .order('eaten_at', { ascending: false }).range(offset, offset + PAGE - 1);
    const list = data || [];
    setMeals((prev) => (offset ? [...prev, ...list] : list));
    setHasMore(list.length === PAGE);
    setLoading(false);
    const paths = list.map((m) => m.photo_path).filter(Boolean);
    if (paths.length) {
      const { data: signed } = await supabase.storage.from('meal-photos').createSignedUrls(paths, 3600);
      if (signed) setPhotoUrls((p) => { const n = { ...p }; signed.forEach((s) => { if (s.signedUrl) n[s.path] = s.signedUrl; }); return n; });
    }
  }
  useEffect(() => { load(0); setSelected(new Set()); }, [reloadKey]);

  const days = useMemo(() => {
    const g = [];
    meals.forEach((m) => {
      const k = localDateKey(m.eaten_at);
      let d = g[g.length - 1];
      if (!d || d.key !== k) g.push((d = { key: k, date: new Date(m.eaten_at), meals: [], protein: 0, kcal: 0 }));
      d.meals.push(m); d.protein += Number(m.protein) || 0; d.kcal += Number(m.kcal) || 0;
    });
    return g;
  }, [meals]);

  // Marca comidas que se repiten igual en varios días (típico de pruebas)
  const repeated = useMemo(() => {
    const count = {};
    meals.forEach((m) => { const k = sig(m); count[k] = (count[k] || 0) + 1; });
    return count;
  }, [meals]);

  function toggle(id) {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleDay(d) {
    setSelected((s) => {
      const n = new Set(s);
      const all = d.meals.every((m) => n.has(m.id));
      d.meals.forEach((m) => (all ? n.delete(m.id) : n.add(m.id)));
      return n;
    });
  }
  function selectRepeated() {
    // Deja la primera aparición de cada comida repetida y selecciona el resto
    const seen = new Set();
    const n = new Set();
    [...meals].reverse().forEach((m) => {
      const k = sig(m);
      if (repeated[k] < 2) return;
      if (seen.has(k)) n.add(m.id); else seen.add(k);
    });
    setSelected(n);
  }

  async function deleteMeals(list) {
    if (!list.length) return;
    setBusy(true);
    const ids = list.map((m) => m.id);
    const photos = list.map((m) => m.photo_path).filter(Boolean);
    for (let i = 0; i < ids.length; i += 100) {
      const { error } = await supabase.from('meals').delete().in('id', ids.slice(i, i + 100));
      if (error) { setBusy(false); return onToast?.('No se pudo borrar'); }
    }
    for (let i = 0; i < photos.length; i += 100) await supabase.storage.from('meal-photos').remove(photos.slice(i, i + 100));
    setBusy(false);
    setSelecting(false);
    onToast?.(`${ids.length} comida${ids.length === 1 ? '' : 's'} borrada${ids.length === 1 ? '' : 's'}`);
    onChanged?.();
    load(0);
  }

  async function deleteSelected() {
    const list = meals.filter((m) => selected.has(m.id));
    if (!list.length) return;
    if (!confirm(`¿Borrar ${list.length} comida${list.length === 1 ? '' : 's'}? No se puede deshacer.`)) return;
    deleteMeals(list);
  }

  return (
    <div className="fullsheet" role="dialog" aria-modal="true" aria-label="Mis registros">
      <div className="fullsheet-inner">
        <div className="sheet-head">
          <h2 className="h2">Mis registros</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>

        <div className="segmented" style={{ marginBottom: 16 }}>
          <button className={tab === 'comidas' ? 'on' : ''} onClick={() => setTab('comidas')}>Comidas</button>
          <button className={tab === 'peso' ? 'on' : ''} onClick={() => setTab('peso')}>Peso</button>
          <button className={tab === 'limpiar' ? 'on' : ''} onClick={() => setTab('limpiar')}>Limpiar</button>
        </div>

        {tab === 'comidas' && (
          <>
            <div className="rec-toolbar">
              <span className="small muted">{meals.length}{hasMore ? '+' : ''} comidas</span>
              <div style={{ display: 'flex', gap: 4 }}>
                {selecting && Object.values(repeated).some((c) => c > 1) && (
                  <button className="link-btn" onClick={selectRepeated}>Elegir repetidas</button>
                )}
                <button className="link-btn" onClick={() => { setSelecting(!selecting); setSelected(new Set()); }}>
                  {selecting ? 'Cancelar' : 'Seleccionar'}
                </button>
              </div>
            </div>
            {!selecting && (
              <p className="tiny muted" style={{ marginTop: 0 }}>Tocá una comida para editar alimentos, gramos, momento o fecha, o para borrarla.</p>
            )}

            {loading && !meals.length ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 50 }}><div className="spinner" /></div>
            ) : meals.length === 0 ? (
              <div className="empty"><p><strong style={{ color: 'var(--text)' }}>No tenés comidas cargadas.</strong></p></div>
            ) : (
              <div className="rec-days">
                {days.map((d) => {
                  const allSel = d.meals.every((m) => selected.has(m.id));
                  return (
                    <section key={d.key} className="rec-day">
                      <div className="rec-day-head">
                        {selecting && (
                          <input type="checkbox" className="chk" checked={allSel} onChange={() => toggleDay(d)} aria-label={`Seleccionar ${d.key}`} />
                        )}
                        <span className="rec-day-name">{dayLabel(d.date)}</span>
                        <span className="tiny muted num">{fmt(d.protein)} g prot, {fmt(d.kcal)} kcal</span>
                      </div>
                      {d.meals.map((m) => {
                        const t = mealTypeById(m.meal_type);
                        const url = photoUrls[m.photo_path];
                        const isRep = repeated[sig(m)] > 1;
                        return (
                          <label key={m.id} className={`rec-meal ${selected.has(m.id) ? 'sel' : ''}`}
                            onClick={selecting ? undefined : (e) => { e.preventDefault(); onOpenMeal(m, url); }}>
                            {selecting && <input type="checkbox" className="chk" checked={selected.has(m.id)} onChange={() => toggle(m.id)} />}
                            {url ? <img className="rec-thumb" src={url} alt="" /> : <span className="rec-thumb">{t.emoji}</span>}
                            <span className="rec-body">
                              <span className="rec-title">{m.title || t.label}</span>
                              <span className="tiny muted">{t.label}, {timeLabel(m.eaten_at)}{isRep ? ', repetida' : ''}</span>
                            </span>
                            <span className="rec-val num"><b>{fmt(m.protein)} g</b><span className="tiny muted">{fmt(m.kcal)} kcal</span></span>
                          </label>
                        );
                      })}
                    </section>
                  );
                })}
                {hasMore && (
                  <button className="btn btn-ghost btn-block" onClick={() => load(meals.length)} disabled={loading}>
                    {loading ? 'Cargando…' : 'Cargar más'}
                  </button>
                )}
              </div>
            )}

            {selecting && (
              <div className="rec-actionbar">
                <span className="small"><strong>{selected.size}</strong> seleccionada{selected.size === 1 ? '' : 's'}</span>
                <button className="btn btn-danger-solid" disabled={!selected.size || busy} onClick={deleteSelected}>
                  {busy ? 'Borrando…' : 'Borrar'}
                </button>
              </div>
            )}
          </>
        )}

        {tab === 'peso' && <WeightList userId={userId} onToast={onToast} onChanged={onChanged} />}

        {tab === 'limpiar' && (
          <CleanUp userId={userId} onToast={onToast} onDone={() => { onChanged?.(); load(0); setTab('comidas'); }} />
        )}
      </div>
    </div>
  );
}

const sig = (m) => `${m.meal_type}|${(m.title || '').toLowerCase()}|${Math.round(m.protein)}|${Math.round(m.kcal)}`;

// ---------- Pesos: editar y borrar ----------
function WeightList({ userId, onToast, onChanged }) {
  const [rows, setRows] = useState(null);
  const [edit, setEdit] = useState(null); // { logged_on, kg, newDate }
  const [add, setAdd] = useState({ logged_on: localDateKey(new Date()), kg: '' });

  async function load() {
    const { data } = await supabase.from('weights').select('id,logged_on,kg').order('logged_on', { ascending: false });
    setRows(data || []);
  }
  useEffect(() => { load(); }, []);

  async function save() {
    const kg = Number(edit.kg);
    if (!kg) return;
    const upd = { kg, logged_on: edit.newDate || edit.logged_on };
    const { error } = await supabase.from('weights').update(upd).eq('id', edit.id);
    if (error) return onToast?.(error.message.includes('duplicate') ? 'Ya hay un peso cargado en esa fecha' : 'No se pudo guardar');
    await syncProfile();
    setEdit(null); onToast?.('Peso actualizado'); onChanged?.(); load();
  }
  async function remove(r) {
    if (!confirm(`¿Borrar el peso del ${fmtDate(r.logged_on)}?`)) return;
    await supabase.from('weights').delete().eq('id', r.id);
    await syncProfile();
    setEdit(null); onToast?.('Peso borrado'); onChanged?.(); load();
  }
  async function addRow(e) {
    e.preventDefault();
    const kg = Number(add.kg);
    if (!kg) return;
    await supabase.from('weights').upsert({ user_id: userId, logged_on: add.logged_on, kg }, { onConflict: 'user_id,logged_on' });
    await syncProfile();
    setAdd({ logged_on: localDateKey(new Date()), kg: '' }); onToast?.('Peso registrado'); onChanged?.(); load();
  }
  // El peso del perfil queda igual al último registro
  async function syncProfile() {
    const { data } = await supabase.from('weights').select('kg').order('logged_on', { ascending: false }).limit(1);
    if (data?.[0]) await supabase.from('profiles').update({ weight_kg: data[0].kg }).eq('id', userId);
  }

  return (
    <>
      <form className="panel" onSubmit={addRow}>
        <h3 className="panel-title">Agregar un peso</h3>
        <p className="tiny muted panel-sub">Podés cargar pesos de fechas anteriores para completar tu historial.</p>
        <div className="row">
          <div className="field"><label>Fecha</label>
            <input className="input" type="date" max={localDateKey(new Date())} value={add.logged_on} onChange={(e) => setAdd({ ...add, logged_on: e.target.value })} /></div>
          <div className="field"><label>Kg</label>
            <input className="input num" type="number" step="0.1" inputMode="decimal" value={add.kg} onChange={(e) => setAdd({ ...add, kg: e.target.value })} /></div>
        </div>
        <button className="btn btn-primary btn-block" disabled={!add.kg}>Agregar</button>
      </form>

      {rows === null ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><div className="spinner" /></div>
      ) : rows.length === 0 ? (
        <p className="small muted">Todavía no registraste tu peso.</p>
      ) : (
        <div className="panel">
          {rows.map((r) => (
            edit?.id === r.id ? (
              <div key={r.id} className="w-edit">
                <div className="row">
                  <input className="input" type="date" max={localDateKey(new Date())} value={edit.newDate || r.logged_on} onChange={(e) => setEdit({ ...edit, newDate: e.target.value })} />
                  <input className="input num" type="number" step="0.1" inputMode="decimal" value={edit.kg} onChange={(e) => setEdit({ ...edit, kg: e.target.value })} autoFocus />
                </div>
                <div className="row" style={{ marginTop: 8 }}>
                  <button className="btn btn-danger" type="button" onClick={() => remove(r)}>Borrar</button>
                  <button className="btn btn-ghost" type="button" onClick={() => setEdit(null)}>Cancelar</button>
                  <button className="btn btn-primary" type="button" onClick={save}>Guardar</button>
                </div>
              </div>
            ) : (
              <button key={r.id} className="w-row" onClick={() => setEdit({ id: r.id, logged_on: r.logged_on, kg: r.kg })}>
                <span className="muted">{fmtDate(r.logged_on)}</span>
                <span className="num"><strong>{Number(r.kg).toLocaleString('es-AR')} kg</strong> <span className="tiny muted">Editar</span></span>
              </button>
            )
          ))}
        </div>
      )}
    </>
  );
}

const fmtDate = (s) => new Date(s + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });

// ---------- Limpieza masiva ----------
function CleanUp({ userId, onToast, onDone }) {
  const [mode, setMode] = useState('antes'); // antes | todo
  const [until, setUntil] = useState(localDateKey(addDays(new Date(), -1)));
  const [weightsToo, setWeightsToo] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);

  // Cuenta cuántos registros se borrarían
  useEffect(() => {
    let alive = true;
    (async () => {
      let q = supabase.from('meals').select('id', { count: 'exact', head: true });
      let w = supabase.from('weights').select('id', { count: 'exact', head: true });
      if (mode === 'antes') {
        const end = new Date(until + 'T23:59:59.999').toISOString();
        q = q.lte('eaten_at', end);
        w = w.lte('logged_on', until);
      }
      const [{ count: mc }, { count: wc }] = await Promise.all([q, w]);
      if (alive) setPreview({ meals: mc || 0, weights: wc || 0 });
    })();
    return () => { alive = false; };
  }, [mode, until]);

  const needsText = mode === 'todo';
  const canRun = preview && (preview.meals || (weightsToo && preview.weights)) && (!needsText || confirmText.trim().toUpperCase() === 'BORRAR');

  async function run() {
    const total = preview.meals + (weightsToo ? preview.weights : 0);
    if (!confirm(`Se van a borrar ${total} registros. ¿Seguro?`)) return;
    setBusy(true);
    const end = new Date(until + 'T23:59:59.999').toISOString();
    // Fotos primero (necesitamos sus rutas antes de borrar las comidas)
    let pq = supabase.from('meals').select('photo_path').not('photo_path', 'is', null);
    if (mode === 'antes') pq = pq.lte('eaten_at', end);
    const { data: ph } = await pq.limit(5000);
    const photos = (ph || []).map((p) => p.photo_path);
    for (let i = 0; i < photos.length; i += 100) await supabase.storage.from('meal-photos').remove(photos.slice(i, i + 100));

    let dq = supabase.from('meals').delete().eq('user_id', userId);
    if (mode === 'antes') dq = dq.lte('eaten_at', end);
    const { error } = await dq;
    if (!error && weightsToo) {
      let wq = supabase.from('weights').delete().eq('user_id', userId);
      if (mode === 'antes') wq = wq.lte('logged_on', until);
      await wq;
    }
    setBusy(false);
    if (error) return onToast?.('No se pudo completar la limpieza');
    onToast?.('Registros borrados');
    onDone?.();
  }

  return (
    <div className="panel">
      <h3 className="panel-title">Borrar registros en bloque</h3>
      <p className="tiny muted panel-sub">Sirve para sacar las cargas de prueba y empezar el seguimiento limpio. Tus objetivos, tu etapa y tu plan no se tocan.</p>

      <div className="segmented" style={{ marginBottom: 14 }}>
        <button className={mode === 'antes' ? 'on' : ''} onClick={() => setMode('antes')}>Hasta una fecha</button>
        <button className={mode === 'todo' ? 'on' : ''} onClick={() => setMode('todo')}>Todo</button>
      </div>

      {mode === 'antes' && (
        <div className="field">
          <label htmlFor="until">Borrar todo lo cargado hasta el</label>
          <input id="until" className="input" type="date" max={localDateKey(new Date())} value={until} onChange={(e) => setUntil(e.target.value)} />
          <span className="tiny muted">Incluye ese día.</span>
        </div>
      )}

      <label className="check-row">
        <input type="checkbox" className="chk" checked={weightsToo} onChange={(e) => setWeightsToo(e.target.checked)} />
        <span>También borrar los pesos registrados</span>
      </label>

      {preview && (
        <p className="small" style={{ margin: '14px 0' }}>
          Se van a borrar <strong>{preview.meals} comida{preview.meals === 1 ? '' : 's'}</strong>
          {weightsToo ? <> y <strong>{preview.weights} peso{preview.weights === 1 ? '' : 's'}</strong></> : null}, con sus fotos.
        </p>
      )}

      {needsText && (
        <div className="field">
          <label htmlFor="ct">Para confirmar, escribí BORRAR</label>
          <input id="ct" className="input" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoCapitalize="characters" />
        </div>
      )}

      <button className="btn btn-danger-solid btn-block" disabled={!canRun || busy} onClick={run}>
        {busy ? 'Borrando…' : 'Borrar registros'}
      </button>
    </div>
  );
}
