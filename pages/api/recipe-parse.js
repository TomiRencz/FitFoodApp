// POST /api/recipe-parse
// Convierte una receta compartida (texto pegado o foto) en una receta estructurada.
import { requireUser, geminiJSON } from '../../lib/server';
import { RECIPE_SCHEMA, RECIPE_RULES, normalizeRecipe } from '../../lib/recipeServer';

export const config = { api: { bodyParser: { sizeLimit: '4.5mb' } } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
  const user = await requireUser(req);
  if (!user) return res.status(401).json({ error: 'No autorizado' });

  const { text, image } = req.body || {};
  if (!text?.trim() && !image) return res.status(400).json({ error: 'Pegá el texto de la receta o subí una foto.' });

  const prompt = `Convertí esta receta en datos estructurados. Respetá los ingredientes y cantidades que figuran; si falta una cantidad, estimala con una porción razonable. Si no indica porciones, estimá cuántas rinde.
Si el contenido no es una receta de comida, devolvé title "NO_ES_RECETA" e ingredients vacío.
"why": una oración sobre para qué sirve esta receta en un plan de entrenamiento (por ej. "Buena fuente de proteína para la cena").

${RECIPE_RULES}
${text ? `\nRECETA:\n${String(text).slice(0, 6000)}` : ''}`;

  const parts = [];
  if (image) parts.push({ inline_data: { mime_type: 'image/jpeg', data: image } });
  parts.push({ text: prompt });

  const { data, error, status } = await geminiJSON({ parts, schema: RECIPE_SCHEMA, temperature: 0.2 });
  if (error) return res.status(status).json({ error });
  if (data.title === 'NO_ES_RECETA' || !data.ingredients?.length) {
    return res.status(422).json({ error: 'No encontré una receta en lo que mandaste.' });
  }
  return res.status(200).json(normalizeRecipe(data));
}
