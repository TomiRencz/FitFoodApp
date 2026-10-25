// Esquema y normalización de recetas (solo servidor)

const ING = {
  type: 'OBJECT',
  properties: {
    name: { type: 'STRING' },
    quantity: { type: 'STRING' },
    grams: { type: 'NUMBER' },
    kcal_100: { type: 'NUMBER' },
    protein_100: { type: 'NUMBER' },
    carbs_100: { type: 'NUMBER' },
    fat_100: { type: 'NUMBER' },
  },
  required: ['name', 'quantity', 'grams', 'kcal_100', 'protein_100', 'carbs_100', 'fat_100'],
};

export const RECIPE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    title: { type: 'STRING' },
    servings: { type: 'NUMBER' },
    prep_minutes: { type: 'NUMBER', nullable: true },
    ingredients: { type: 'ARRAY', items: ING },
    steps: { type: 'ARRAY', items: { type: 'STRING' } },
    tags: { type: 'ARRAY', items: { type: 'STRING' } },
    meal_types: { type: 'ARRAY', items: { type: 'STRING', enum: ['desayuno', 'almuerzo', 'merienda', 'cena', 'snack'] } },
    style: { type: 'STRING', enum: ['completo', 'lowcarb'] },
    why: { type: 'STRING' },
  },
  required: ['title', 'servings', 'ingredients', 'steps', 'tags', 'meal_types', 'style', 'why'],
};

export const RECIPE_RULES = `REGLAS PARA LA RECETA
- Español rioplatense, ingredientes que se consiguen en Argentina.
- ingredients: cada uno con "quantity" en medida casera ("2 unidades", "1 taza", "1 cda") y "grams" = su peso aproximado en gramos TOTAL para toda la receta (en el estado en que se usa: crudo si se cocina en la receta).
- Para cada ingrediente, kcal_100, protein_100, carbs_100 y fat_100 = valores cada 100 g en ese estado (tablas ARGENFOODS / USDA). Incluí el aceite o la manteca que se usa para cocinar.
- servings: cantidad de porciones que rinde. steps: pasos cortos y claros, sin numerarlos.
- tags: 2 a 4 etiquetas cortas (por ej. "alta en proteína", "rápida", "sin TACC", "vianda").
- meal_types: en qué momentos del día encaja.
- style: "completo" si tiene carbohidratos complejos como parte principal; "lowcarb" si es proteína + grasa + vegetales.
- prep_minutes: tiempo total aproximado.`;

// Normaliza y calcula totales por porción en el servidor (no confiamos en la cuenta del modelo)
export function normalizeRecipe(r) {
  const n = (v) => Math.max(0, Number(v) || 0);
  const servings = Math.max(1, Math.round(n(r.servings) || 1));
  const ingredients = (r.ingredients || []).map((i) => ({
    name: String(i.name || 'Ingrediente'),
    quantity: String(i.quantity || ''),
    grams: Math.round(n(i.grams)),
    kcal_100: n(i.kcal_100), protein_100: n(i.protein_100), carbs_100: n(i.carbs_100), fat_100: n(i.fat_100),
  })).filter((i) => i.grams > 0);
  return {
    title: String(r.title || 'Receta').slice(0, 120),
    servings,
    prep_minutes: r.prep_minutes ? Math.round(n(r.prep_minutes)) : null,
    ingredients,
    steps: (r.steps || []).map(String).filter(Boolean).slice(0, 20),
    tags: (r.tags || []).map((t) => String(t).toLowerCase()).slice(0, 4),
    meal_types: (r.meal_types || []).filter((t) => ['desayuno', 'almuerzo', 'merienda', 'cena', 'snack'].includes(t)),
    style: ['completo', 'lowcarb'].includes(r.style) ? r.style : null,
    why: r.why ? String(r.why) : '',
  };
}
