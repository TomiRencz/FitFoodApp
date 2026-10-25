// Cálculos de seguimiento: días, semanas, comidas y peso.
import { addDays, localDateKey } from './dates';
import { MEAL_TYPES } from './nutrition';

const n = (v) => Number(v) || 0;

// Días entre dos fechas (YYYY-MM-DD), con los vacíos incluidos
export function buildDays(meals, fromKey, toKey) {
  const map = {};
  meals.forEach((m) => {
    const k = localDateKey(m.eaten_at);
    const d = (map[k] = map[k] || { kcal: 0, protein: 0, carbs: 0, fat: 0, meals: 0 });
    d.kcal += n(m.kcal); d.protein += n(m.protein); d.carbs += n(m.carbs); d.fat += n(m.fat); d.meals += 1;
  });
  const out = [];
  let d = new Date(fromKey + 'T12:00:00');
  const end = new Date(toKey + 'T12:00:00');
  while (d <= end) {
    const k = localDateKey(d);
    out.push({ key: k, date: new Date(d), logged: !!map[k], ...(map[k] || { kcal: 0, protein: 0, carbs: 0, fat: 0, meals: 0 }) });
    d = addDays(d, 1);
  }
  return out;
}

// Resumen de un conjunto de días (solo cuenta los días con comidas cargadas)
export function summarize(days, profile) {
  const logged = days.filter((d) => d.logged);
  const c = logged.length;
  const avg = (f) => (c ? logged.reduce((s, d) => s + d[f], 0) / c : 0);
  const pGoal = n(profile?.protein_target);
  const kGoal = n(profile?.kcal_target);
  const hits = logged.filter((d) => pGoal && d.protein >= pGoal * 0.95).length;
  const sorted = [...logged].sort((a, b) => b.protein - a.protein);
  return {
    totalDays: days.length,
    loggedDays: c,
    protein: avg('protein'),
    kcal: avg('kcal'),
    carbs: avg('carbs'),
    fat: avg('fat'),
    proteinHits: hits,
    proteinPct: pGoal ? (avg('protein') / pGoal) * 100 : null,
    kcalPct: kGoal ? (avg('kcal') / kGoal) * 100 : null,
    best: sorted[0] || null,
    worst: sorted.length > 1 ? sorted[sorted.length - 1] : null,
  };
}

// Proteína promedio por momento del día y cuántas veces llegó al objetivo por comida
export function byMealType(meals, perMealGoal) {
  const acc = {};
  meals.forEach((m) => {
    const t = (acc[m.meal_type] = acc[m.meal_type] || { count: 0, protein: 0, kcal: 0, hits: 0 });
    t.count += 1; t.protein += n(m.protein); t.kcal += n(m.kcal);
    if (perMealGoal && n(m.protein) >= perMealGoal * 0.9) t.hits += 1;
  });
  return MEAL_TYPES.filter((t) => acc[t.id]).map((t) => {
    const a = acc[t.id];
    return { ...t, count: a.count, protein: a.protein / a.count, kcal: a.kcal / a.count, hits: a.hits, hitPct: (a.hits / a.count) * 100 };
  });
}

// Alimentos más frecuentes (agrupa por nombre normalizado)
export function topFoods(meals, limit = 6) {
  const acc = {};
  meals.forEach((m) => (m.items || []).forEach((it) => {
    const key = normalize(it.name);
    if (!key) return;
    const f = (acc[key] = acc[key] || { name: it.name, count: 0, protein: 0, kcal: 0, grams: 0 });
    f.count += 1; f.protein += n(it.protein); f.kcal += n(it.kcal); f.grams += n(it.grams);
  }));
  return Object.values(acc)
    .sort((a, b) => b.count - a.count || b.protein - a.protein)
    .slice(0, limit);
}

function normalize(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\b(cocid[oa]s?|grillad[oa]s?|al horno|a la plancha|hervid[oa]s?|crud[oa]s?)\b/g, '')
    .replace(/\s+/g, ' ').trim();
}

// Semanas de la etapa: la semana 1 arranca el día de inicio
export function buildWeeks(days, startKey) {
  const start = new Date(startKey + 'T12:00:00');
  const weeks = [];
  days.forEach((d) => {
    const idx = Math.floor((d.date - start) / (7 * 86400000));
    if (idx < 0) return;
    (weeks[idx] = weeks[idx] || { index: idx + 1, days: [] }).days.push(d);
  });
  return weeks.filter(Boolean);
}

// Variación de peso dentro de un rango
export function weightChange(weights, fromKey, toKey) {
  const inRange = weights.filter((w) => w.logged_on >= fromKey && w.logged_on <= toKey)
    .sort((a, b) => a.logged_on.localeCompare(b.logged_on));
  if (inRange.length < 2) return null;
  const first = inRange[0], last = inRange[inRange.length - 1];
  const days = Math.max(1, (new Date(last.logged_on) - new Date(first.logged_on)) / 86400000);
  const diff = n(last.kg) - n(first.kg);
  return { from: n(first.kg), to: n(last.kg), diff, perWeek: (diff / days) * 7, points: inRange };
}

// Ritmo de peso esperado por semana según la etapa (% del peso corporal)
export const EXPECTED_RATE = {
  volumen: { min: 0.0025, max: 0.005, label: 'subir entre 0,25 % y 0,5 % del peso por semana' },
  definicion: { min: -0.01, max: -0.005, label: 'bajar entre 0,5 % y 1 % del peso por semana' },
  mantenimiento: { min: -0.0025, max: 0.0025, label: 'mantenerse estable' },
};

export function rateStatus(phase, perWeekKg, bodyKg) {
  const r = EXPECTED_RATE[phase];
  if (!r || !bodyKg || perWeekKg === null || perWeekKg === undefined) return null;
  const pct = perWeekKg / bodyKg;
  if (pct < r.min) return phase === 'definicion' ? 'rapido' : 'lento';
  if (pct > r.max) return phase === 'definicion' ? 'lento' : 'rapido';
  return 'ok';
}

// Rango de fechas para el selector del historial
export function periodRange(period, profile) {
  const to = localDateKey(new Date());
  if (period === 'etapa' && profile?.phase_started_on) return { from: profile.phase_started_on, to };
  const daysBack = period === '30' ? 29 : 6;
  return { from: localDateKey(addDays(new Date(), -daysBack)), to };
}
