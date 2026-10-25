import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { compressImage } from '../lib/image';
import { MEAL_TYPES } from '../lib/nutrition';
import { apiPost } from '../lib/recipes';
import CookSheet, { RecipeCard } from './CookSheet';
import RecipeSheet from './RecipeSheet';

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export default function RecipesView({ userId, profile, dayTotals, onToast, onMealLogged }) {
  const [recipes, setRecipes] = useState(null);
  const [tableMissing, setTableMissing] = useState(false);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('todas');
  const [open, setOpen] = useState(null);      // receta abierta
  const [cookOpen, setCookOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  async function load() {
    const { data, error } = await supabase.from('recipes').select('*').order('favorite', { ascending: false }).order('created_at', { ascending: false });
    if (error) { setTableMissing(true); setRecipes([]); return; }
    setRecipes(data || []);
  }
  useEffect(() => { load(); }, []);

  const list = useMemo(() => {
    if (!recipes) return [];
    const nq = norm(q);
    return recipes.filter((r) => {
      if (filter === 'favoritas' && !r.favorite) return false;
      if (filter !== 'todas' && filter !== 'favoritas' && !(r.meal_types || []).includes(filter)) return false;
      if (!nq) return true;
      return norm(r.title).includes(nq) || (r.ingredients || []).some((i) => norm(i.name).includes(nq)) || (r.tags || []).some((t) => norm(t).includes(nq));
    });
  }, [recipes, q, filter]);

  function upsertLocal(rec) {
    setRecipes((rs) => {
      const i = rs.findIndex((x) => x.id === rec.id);
      if (i === -1) return [rec, ...rs];
      const n = [...rs]; n[i] = rec; return n;
    });
  }

  return (
    <>
      <h1 className="h1" style={{ marginBottom: 16 }}>Recetas</h1>

      {tableMissing && (
        <div className="error">Falta crear la tabla de recetas: corré la migración 003 en el SQL Editor de Supabase.</div>
      )}

      <button className="cook-cta" onClick={() => setCookOpen(true)}>
        <span className="cook-cta-title">¿Qué cocino?</span>
        <span className="small">Elegí lo que tenés y te propongo recetas para tu {profile?.phase === 'definicion' ? 'definición' : profile?.phase || 'etapa'}.</span>
      </button>

      <div className="row" style={{ alignItems: 'stretch', margin: '14px 0 10px' }}>
        <input className="input" type="search" placeholder="Buscar por nombre o ingrediente" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 3 }} />
        <button className="btn btn-ghost" onClick={() => setAddOpen(true)}>Agregar</button>
      </div>

      <div className="chips" style={{ marginBottom: 14 }}>
        {[['todas', 'Todas'], ['favoritas', '★ Favoritas'], ...MEAL_TYPES.filter((m) => !['pre', 'post'].includes(m.id)).map((m) => [m.id, m.label])].map(([id, l]) => (
          <button key={id} className={`chip chip-sm ${filter === id ? 'on' : ''}`} onClick={() => setFilter(id)}>{l}</button>
        ))}
      </div>

      {recipes === null ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><div className="spinner" /></div>
      ) : recipes.length === 0 ? (
        <div className="empty">
          <p style={{ fontSize: 28 }}>📖</p>
          <p><strong style={{ color: 'var(--text)' }}>Tu recetario está vacío.</strong></p>
          <p className="small">Pegá una receta que te pasaron, sacale una foto a una, o pedí ideas en “¿Qué cocino?” y guardá las que te gusten.</p>
        </div>
      ) : list.length === 0 ? (
        <p className="small muted">No hay recetas que coincidan.</p>
      ) : (
        <div className="recipe-list">
          {list.map((r) => <RecipeCard key={r.id} recipe={r} onClick={() => setOpen(r)} />)}
        </div>
      )}

      {cookOpen && (
        <CookSheet recipes={recipes || []} profile={profile} dayTotals={dayTotals}
          onClose={() => setCookOpen(false)} onOpenRecipe={(r) => setOpen(r)} />
      )}

      {addOpen && (
        <AddRecipe onClose={() => setAddOpen(false)} onParsed={(r) => { setAddOpen(false); setOpen(r); }} />
      )}

      {open && (
        <RecipeSheet key={open.id || open.title} recipe={open} userId={userId} profile={profile} onToast={onToast}
          onClose={() => setOpen(null)}
          onSaved={(rec, msg) => { upsertLocal(rec); setOpen(rec); if (msg) onToast?.(msg); }}
          onDeleted={(id) => { setRecipes((rs) => rs.filter((x) => x.id !== id)); setOpen(null); onToast?.('Receta borrada'); }}
          onLogged={(msg) => { setOpen(null); setCookOpen(false); onMealLogged?.(msg); }} />
      )}
    </>
  );
}

// Importar receta desde texto o foto
function AddRecipe({ onClose, onParsed }) {
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function onPick(e) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try { setPhoto(await compressImage(f, 1600, 0.85)); } catch { setError('No se pudo leer la foto.'); }
  }

  async function analyze() {
    setLoading(true); setError('');
    try {
      const r = await apiPost('/api/recipe-parse', { text: text.trim() || undefined, image: photo?.base64 });
      onParsed({ ...r, source: photo ? 'foto' : 'texto', favorite: false });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="backdrop" onClick={loading ? undefined : onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Agregar receta">
        <div className="sheet-inner">
          <div className="grabber" />
          <div className="sheet-head"><h2 className="h2">Agregar receta</h2><button className="icon-btn" onClick={onClose} aria-label="Cerrar" disabled={loading}>✕</button></div>
          <p className="small muted" style={{ marginTop: 0 }}>Pegá la receta que te pasaron (de WhatsApp, Instagram, una web) o sacale una foto. Calculo ingredientes, pasos y macros por porción.</p>

          {photo ? (
            <div className={`preview ${loading ? 'scanning' : ''}`}>
              <img src={photo.dataUrl} alt="Receta" />
              {!loading && <button className="x" onClick={() => setPhoto(null)} aria-label="Quitar foto">✕</button>}
            </div>
          ) : (
            <div className="photo-pick">
              <label className="gal" style={{ gridColumn: '1 / -1' }}>
                <span className="ico">📷</span>Sacar foto o elegir imagen
                <input type="file" accept="image/*" onChange={onPick} />
              </label>
            </div>
          )}

          <div className="field">
            <label htmlFor="rt">{photo ? 'Aclaraciones (opcional)' : 'O pegá el texto'}</label>
            <textarea id="rt" className="textarea" style={{ minHeight: 120 }} value={text} onChange={(e) => setText(e.target.value)} disabled={loading}
              placeholder="Ej: Wok de pollo. 400 g de pechuga, 1 taza de arroz yamaní, 1 brócoli…" />
          </div>

          {error && <div className="error">{error}</div>}
          <button className="btn btn-primary btn-block" onClick={analyze} disabled={loading || (!photo && !text.trim())}>
            {loading ? 'Leyendo la receta…' : 'Analizar receta'}
          </button>
        </div>
      </div>
    </>
  );
}
