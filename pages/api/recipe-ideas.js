// POST /api/recipe-ideas
// Propone recetas nuevas a partir de ingredientes elegidos, la etapa, el plan
// y lo que le falta al usuario para completar el día.
import { requireUser, geminiJSON } from '../../lib/server';
import { RECIPE_SCHEMA, RECIPE_RULES, normalizeRecipe } from '../../lib/recipeServer';

const SCHEMA = {
  type: 'OBJECT',
  properties: { recipes: { type: 'ARRAY', items: RECIPE_SCHEMA } },
  required: ['recipes'],
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
  const user = await requireUser(req);
  if (!user) return res.status(401).json({ error: 'No autorizado' });

  const { ingredients = [], mealType, context = {}, avoidTitles = [] } = req.body || {};
  const list = ingredients.map(String).slice(0, 15);

  const phase = { volumen: 'VOLUMEN (superávit, ganar músculo)', definicion: 'DEFINICIÓN (déficit, bajar grasa manteniendo músculo)', mantenimiento: 'MANTENIMIENTO' }[context.phase] || 'no indicada';

  const prompt = `Sos un nutricionista deportivo y cocinero argentino. Proponé 3 recetas distintas entre sí (técnica y estilo diferentes), caseras y realistas para una persona que entrena fuerte.

${list.length ? `INGREDIENTES QUE TIENE (usá la mayoría como base; podés sumar básicos de alacena como aceite, sal, especias, cebolla, ajo, limón): ${list.join(', ')}` : 'No eligió ingredientes: proponé recetas con ingredientes comunes y accesibles.'}
${mealType ? `MOMENTO DEL DÍA: ${mealType}` : ''}
ETAPA: ${phase}
${context.style ? `SEGÚN SU PLAN ESTA COMIDA DEBERÍA SER: ${context.style}` : ''}
OBJETIVO DE PROTEÍNA POR COMIDA: ~${context.proteinPerMeal || 40} g por porción.
${context.remaining ? `LE FALTA PARA COMPLETAR EL DÍA: ${Math.round(context.remaining.kcal)} kcal y ${Math.round(context.remaining.protein)} g de proteína. Ajustá la porción a eso (sin pasarse mucho de calorías si está en definición).` : ''}
${context.plan ? `PLAN DE SU NUTRICIONISTA (respetalo: priorizá lo recomendado y evitá lo que dice evitar):\n${String(context.plan).slice(0, 1500)}` : ''}
${avoidTitles.length ? `NO repitas estas recetas que ya tiene: ${avoidTitles.slice(0, 20).join('; ')}` : ''}

"why": una oración de por qué esta receta le sirve hoy (proteína, momento, etapa).

${RECIPE_RULES}`;

  const { data, error, status } = await geminiJSON({ parts: [{ text: prompt }], schema: SCHEMA, temperature: 0.8 });
  if (error) return res.status(status).json({ error });
  const recipes = (data.recipes || []).map(normalizeRecipe).filter((r) => r.ingredients.length).slice(0, 3);
  if (!recipes.length) return res.status(502).json({ error: 'No se pudieron generar ideas. Probá de nuevo.' });
  return res.status(200).json({ recipes });
}
