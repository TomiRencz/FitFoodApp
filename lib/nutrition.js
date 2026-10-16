// Lógica de objetivos, etapas y momentos del día

export const PHASES = {
  volumen:       { label: 'Volumen',       emoji: '📈', kcalAdj: 0.10,  fatPerKg: 0.9, color: '#5B8CFF',
                   hint: 'Superávit moderado para ganar músculo.' },
  definicion:    { label: 'Definición',    emoji: '🔥', kcalAdj: -0.20, fatPerKg: 0.8, color: '#FF7A45',
                   hint: 'Déficit para bajar grasa sosteniendo la proteína alta y el músculo.' },
  mantenimiento: { label: 'Mantenimiento', emoji: '⚖️', kcalAdj: 0,     fatPerKg: 0.9, color: '#3FCF8E',
                   hint: 'Comer lo que gastás.' },
};

export const MEAL_TYPES = [
  { id: 'desayuno', label: 'Desayuno', emoji: '☕' },
  { id: 'almuerzo', label: 'Almuerzo', emoji: '🍽️' },
  { id: 'merienda', label: 'Merienda', emoji: '🥪' },
  { id: 'cena',     label: 'Cena',     emoji: '🌙' },
  { id: 'pre',      label: 'Pre-entreno',  emoji: '⚡' },
  { id: 'post',     label: 'Post-entreno', emoji: '💪' },
  { id: 'snack',    label: 'Snack',    emoji: '🍎' },
];
export const mealTypeById = (id) => MEAL_TYPES.find((m) => m.id === id) || MEAL_TYPES[6];

export const TRAINING_TIMES = {
  manana:   'Entreno a la mañana',
  tarde:    'Entreno a la tarde / noche',
  descanso: 'Día de descanso',
};

// Momento del día sugerido según la hora actual
export function suggestMealType(date = new Date()) {
  const h = date.getHours();
  if (h < 11) return 'desayuno';
  if (h < 16) return 'almuerzo';
  if (h < 20) return 'merienda';
  return 'cena';
}

// Esquema del plan: qué tipo de plato toca según cuándo entrenás
// Mañana: desayuno y almuerzo completos, merienda y cena low carb.
// Tarde/noche: al revés (post-entreno prioriza carbohidratos).
export function mealStyle(trainingTime, mealType) {
  if (!trainingTime || trainingTime === 'descanso') return null;
  const early = ['desayuno', 'almuerzo'].includes(mealType);
  const late = ['merienda', 'cena'].includes(mealType);
  if (!early && !late) return null;
  const complete = trainingTime === 'manana' ? early : late;
  return complete
    ? { id: 'completo', label: 'Plato completo', desc: 'Proteína + HC + grasa + fibra' }
    : { id: 'lowcarb', label: 'Low carb', desc: 'Proteína + grasa + fibra' };
}

// Estimación de objetivos (Mifflin-St Jeor × actividad, ajustado por etapa).
// Es un punto de partida: los valores quedan editables.
export function suggestTargets({ sex = 'm', age, height_cm, weight_kg, phase = 'volumen', protein_per_kg = 2.0 }) {
  const w = Number(weight_kg), h = Number(height_cm), a = Number(age);
  if (!w || !h || !a) return null;
  const bmr = 10 * w + 6.25 * h - 5 * a + (sex === 'f' ? -161 : 5);
  const tdee = bmr * 1.5; // ~3 entrenamientos de fuerza por semana
  const p = PHASES[phase] || PHASES.volumen;
  const kcal = Math.round((tdee * (1 + p.kcalAdj)) / 10) * 10;
  const protein = Math.round(w * Number(protein_per_kg || 2));
  const fat = Math.round(w * p.fatPerKg);
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  return { kcal, protein, carbs, fat, tdee: Math.round(tdee) };
}

// ---------- Ítems de comida ----------
// Cada ítem guarda valores cada 100 g para poder recalcular al editar gramos.
export function scaleItem(item, grams) {
  const g = Math.max(0, Number(grams) || 0);
  const f = g / 100;
  return {
    ...item,
    grams: g,
    kcal: round1(item.kcal_100 * f),
    protein: round1(item.protein_100 * f),
    carbs: round1(item.carbs_100 * f),
    fat: round1(item.fat_100 * f),
  };
}

export function sumItems(items = []) {
  return items.reduce(
    (t, i) => ({
      kcal: t.kcal + (Number(i.kcal) || 0),
      protein: t.protein + (Number(i.protein) || 0),
      carbs: t.carbs + (Number(i.carbs) || 0),
      fat: t.fat + (Number(i.fat) || 0),
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 }
  );
}

export const round1 = (n) => Math.round((Number(n) || 0) * 10) / 10;
export const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('es-AR');

export function daysSince(dateStr) {
  if (!dateStr) return null;
  const start = new Date(dateStr + 'T00:00:00');
  return Math.floor((Date.now() - start.getTime()) / 86400000) + 1;
}
