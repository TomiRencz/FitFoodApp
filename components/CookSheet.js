import { useEffect, useMemo, useState } from 'react';
import { MEAL_TYPES, mealStyle, suggestMealType, fmt } from '../lib/nutrition';
import { PANTRY, apiPost, matchRecipes } from '../lib/recipes';

// "¿Qué cocino?": elegís ingredientes y momento; muestra tus recetas que coinciden y genera ideas nuevas.
export default function CookSheet({ recipes, profile, dayTotals, onClose, onOpenRecipe }) {
  const [chips, setChips] = useState([]);
  const [custom, setCustom] = useState('');
  const [mealType, setMealType] = useState(suggestMealType());
  const [ideas, setIdeas] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const toggle = (c) => setChips((s) => (s.includes(c) ? s.filter((x) => x !== c) : [...s, c]));
  function addCustom(e) {
    e.preventDefault();
    const v = custom.trim();
    if (v && !chips.includes(v)) setChips((s) => [...s, v]);
    setCustom('');
  }

  const matches = useMemo(() => matchRecipes(recipes, chips), [recipes, chips]);
  const style = mealStyle(profile?.training_time, mealType);
  const remaining = profile ? {
    kcal: Math.max(0, (profile.kcal_target || 0) - (dayTotals?.kcal || 0)),
    protein: Math.max(0, (profile.protein_target || 0) - (dayTotals?.protein || 0)),
  } : null;
  const proteinPerMeal = Math.round((profile?.protein_target || 160) / (profile?.meals_per_day || 4));
  const customChips = chips.filter((c) => !PANTRY.some((g) => g.items.includes(c)));

  async function generate() {
    setLoading(true); setError(''); setIdeas(null);
    try {
      const data = await apiPost('/api/recipe-ideas', {
        ingredients: chips,
        mealType: MEAL_TYPES.find((m) => m.id === mealType)?.label,
        avoidTitles: recipes.map((r) => r.title),
        context: {
          phase: profile?.phase,
          style: style ? `${style.label} (${style.desc})` : undefined,
          proteinPerMeal,
          remaining,
          plan: profile?.plan_summary || undefined,
        },
      });
      setIdeas(data.recipes.map((r) => ({ ...r, source: 'idea', favorite: false })));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fullsheet" role="dialog" aria-modal="true" aria-label="¿Qué cocino?">
      <div className="fullsheet-inner">
        <div className="sheet-head">
          <h2 className="h2">¿Qué cocino?</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>

        <div className="field">
          <label>¿Para qué comida?</label>
          <div className="chips">
            {MEAL_TYPES.filter((m) => !['pre', 'post'].includes(m.id)).map((m) => (
              <button key={m.id} className={`chip ${mealType === m.id ? 'on' : ''}`} onClick={() => setMealType(m.id)}>{m.emoji} {m.label}</button>
            ))}
          </div>
          {style && <span className="tiny muted">Según tu plan va {style.label.toLowerCase()}.</span>}
        </div>

        <p className="small" style={{ margin: '18px 0 8px' }}>
          <strong>¿Qué tenés?</strong> <span className="muted">Elegí ingredientes, o dejalo vacío para que te sugiera.</span>
        </p>
        {PANTRY.map((g) => (
          <div key={g.group} className="pantry-group">
            <div className="tiny muted pantry-label">{g.group}</div>
            <div className="pantry-chips">
              {g.items.map((c) => (
                <button key={c} className={`chip chip-sm ${chips.includes(c) ? 'on' : ''}`} onClick={() => toggle(c)} aria-pressed={chips.includes(c)}>{c}</button>
              ))}
            </div>
          </div>
        ))}
        <form className="row" onSubmit={addCustom} style={{ marginTop: 10 }}>
          <input className="input" placeholder="Otro ingrediente" value={custom} onChange={(e) => setCustom(e.target.value)} style={{ flex: 3 }} />
          <button className="btn btn-ghost" disabled={!custom.trim()}>Sumar</button>
        </form>
        {customChips.length > 0 && (
          <div className="pantry-chips" style={{ marginTop: 8 }}>
            {customChips.map((c) => <button key={c} className="chip chip-sm on" onClick={() => toggle(c)}>{c} ✕</button>)}
          </div>
        )}

        {remaining && remaining.protein > 0 && (
          <p className="tiny muted" style={{ marginTop: 14 }}>Hoy te faltan {fmt(remaining.protein)} g de proteína y {fmt(remaining.kcal)} kcal. Las ideas se ajustan a eso.</p>
        )}

        {chips.length > 0 && (
          <>
            <h3 className="h2 form-section">De tus recetas</h3>
            {matches.length ? (
              <div className="recipe-list">
                {matches.slice(0, 6).map(({ recipe, hits }) => (
                  <RecipeCard key={recipe.id} recipe={recipe} onClick={() => onOpenRecipe(recipe)} extra={`Usa ${hits.join(', ').toLowerCase()}`} />
                ))}
              </div>
            ) : (
              <p className="small muted">Ninguna de tus recetas usa {chips.length === 1 ? 'ese ingrediente' : 'esos ingredientes'}.</p>
            )}
          </>
        )}

        <h3 className="h2 form-section">Ideas nuevas</h3>
        {error && <div className="error">{error}</div>}
        {ideas ? (
          <>
            <div className="recipe-list">
              {ideas.map((r, i) => <RecipeCard key={i} recipe={r} onClick={() => onOpenRecipe(r)} extra={r.why} />)}
            </div>
            <button className="btn btn-ghost btn-block" style={{ marginTop: 10 }} onClick={generate} disabled={loading}>
              {loading ? 'Pensando…' : 'Otras ideas'}
            </button>
          </>
        ) : (
          <button className="btn btn-primary btn-block" onClick={generate} disabled={loading}>
            {loading ? <><span className="spinner sm" /> Pensando recetas…</> : chips.length ? `Proponer recetas con ${chips.length} ingrediente${chips.length === 1 ? '' : 's'}` : 'Proponer recetas'}
          </button>
        )}
      </div>
    </div>
  );
}

export function RecipeCard({ recipe, onClick, extra }) {
  return (
    <button className="recipe-card" onClick={onClick}>
      <span className="rc-main">
        <span className="rc-title">{recipe.favorite ? '★ ' : ''}{recipe.title}</span>
        <span className="tiny muted rc-meta">
          {[recipe.prep_minutes ? `${recipe.prep_minutes} min` : null, `${recipe.servings} porc.`, recipe.style === 'lowcarb' ? 'Low carb' : recipe.style === 'completo' ? 'Completo' : null].filter(Boolean).join(', ')}
        </span>
        {extra && <span className="tiny rc-extra">{extra}</span>}
      </span>
      <span className="rc-macros num">
        <b>{fmt(perServingProtein(recipe))} g</b>
        <span className="tiny muted">{fmt(perServingKcal(recipe))} kcal</span>
      </span>
    </button>
  );
}

// Para ideas sin guardar los totales vienen de los ingredientes
function per(recipe, key) {
  if (recipe.id && recipe[key] !== undefined && recipe[key] !== null) return Number(recipe[key]);
  const s = Math.max(1, Number(recipe.servings) || 1);
  return (recipe.ingredients || []).reduce((a, i) => a + (i[`${key}_100`] || 0) * (i.grams || 0) / 100, 0) / s;
}
const perServingProtein = (r) => per(r, 'protein');
const perServingKcal = (r) => per(r, 'kcal');
