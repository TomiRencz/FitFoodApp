// Lógica de recetas del lado del celu
import { supabase } from './supabase';
import { round1, scaleItem } from './nutrition';

// POST autenticado a las rutas /api
export async function apiPost(path, body) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || (res.status === 413 ? 'El archivo es muy pesado.' : 'Algo falló. Probá de nuevo.'));
  return data;
}

// Totales de la receta completa y por porción
export function recipeTotals(r) {
  const t = (r.ingredients || []).reduce((acc, i) => {
    const f = (Number(i.grams) || 0) / 100;
    acc.grams += Number(i.grams) || 0;
    acc.kcal += (i.kcal_100 || 0) * f; acc.protein += (i.protein_100 || 0) * f;
    acc.carbs += (i.carbs_100 || 0) * f; acc.fat += (i.fat_100 || 0) * f;
    return acc;
  }, { grams: 0, kcal: 0, protein: 0, carbs: 0, fat: 0 });
  const s = Math.max(1, Number(r.servings) || 1);
  return {
    total: t,
    perServing: { grams: t.grams / s, kcal: round1(t.kcal / s), protein: round1(t.protein / s), carbs: round1(t.carbs / s), fat: round1(t.fat / s) },
  };
}

// Fila lista para guardar en Supabase
export function recipeRow(r) {
  const { perServing } = recipeTotals(r);
  return {
    title: r.title?.trim() || 'Receta',
    servings: Math.max(1, Math.round(Number(r.servings) || 1)),
    prep_minutes: r.prep_minutes || null,
    ingredients: r.ingredients || [],
    steps: (r.steps || []).filter((s) => String(s).trim()),
    tags: r.tags || [],
    meal_types: r.meal_types || [],
    style: r.style || null,
    kcal: perServing.kcal, protein: perServing.protein, carbs: perServing.carbs, fat: perServing.fat,
    notes: r.notes || null,
    source: r.source || null,
    favorite: !!r.favorite,
    updated_at: new Date().toISOString(),
  };
}

// Ítems de comida a partir de N porciones de la receta (cada ingrediente escalado)
export function recipeToMealItems(r, portions = 1) {
  const s = Math.max(1, Number(r.servings) || 1);
  const f = portions / s;
  return (r.ingredients || []).map((i) => scaleItem({ ...i, confidence: 'alta' }, Math.round((Number(i.grams) || 0) * f)));
}

// Ingredientes rápidos para "¿Qué cocino?", agrupados según el plan
export const PANTRY = [
  { group: 'Proteínas', items: ['Pollo', 'Carne magra', 'Carne picada', 'Huevos', 'Atún', 'Merluza', 'Cerdo magro', 'Queso', 'Yogur griego', 'Ricota'] },
  { group: 'Carbohidratos', items: ['Arroz', 'Papa', 'Batata', 'Fideos', 'Avena', 'Pan integral', 'Lentejas', 'Garbanzos', 'Quinoa', 'Choclo'] },
  { group: 'Vegetales y frutas', items: ['Brócoli', 'Espinaca', 'Tomate', 'Zapallito', 'Zanahoria', 'Cebolla', 'Morrón', 'Champiñones', 'Banana', 'Frutos rojos'] },
  { group: 'Grasas', items: ['Palta', 'Aceite de oliva', 'Frutos secos', 'Mantequilla de maní', 'Semillas'] },
];

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const ALIASES = { 'carne magra': ['carne', 'lomo', 'cuadril', 'peceto', 'nalga', 'bife'], 'carne picada': ['picada'], huevos: ['huevo', 'clara'], pollo: ['pollo', 'pechuga', 'muslo'], fideos: ['fideo', 'pasta'], 'frutos secos': ['nuez', 'nueces', 'almendra', 'castana', 'mani'], semillas: ['chia', 'lino', 'sesamo'], 'cerdo magro': ['cerdo', 'solomillo', 'carre'], morron: ['morron', 'pimiento'], zapallito: ['zapallito', 'zucchini', 'zuchini'] };

function terms(chip) {
  const k = norm(chip);
  return ALIASES[k] || [k.replace(/s$/, '')];
}

// Recetas guardadas que usan los ingredientes elegidos (más coincidencias primero)
export function matchRecipes(recipes, chips) {
  if (!chips.length) return [];
  return recipes.map((r) => {
    const names = (r.ingredients || []).map((i) => norm(i.name)).join(' | ') + ' | ' + norm(r.title);
    const hits = chips.filter((c) => terms(c).some((t) => names.includes(t)));
    return { recipe: r, hits };
  }).filter((x) => x.hits.length).sort((a, b) => b.hits.length - a.hits.length);
}
