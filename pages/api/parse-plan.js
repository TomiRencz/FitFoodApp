// POST /api/parse-plan
// Recibe el plan de la nutricionista (PDF o foto) y devuelve los objetivos que encuentre
// más un resumen corto que la app guarda como contexto para analizar las comidas.
import { requireUser, geminiJSON } from '../../lib/server';

export const config = { api: { bodyParser: { sizeLimit: '4.5mb' } } };

const ALLOWED = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'];

const num = { type: 'NUMBER', nullable: true };
const SCHEMA = {
  type: 'OBJECT',
  properties: {
    is_plan: { type: 'BOOLEAN' },
    weight_kg: num,
    height_cm: num,
    age: num,
    sex: { type: 'STRING', enum: ['m', 'f'], nullable: true },
    protein_target: num,
    protein_per_kg: num,
    kcal_target: num,
    carbs_target: num,
    fat_target: num,
    meals_per_day: num,
    phase: { type: 'STRING', enum: ['volumen', 'definicion', 'mantenimiento'], nullable: true },
    summary: { type: 'STRING' },
    missing: { type: 'STRING' },
  },
  required: ['is_plan', 'summary', 'missing'],
};

const PROMPT = `Sos un asistente que lee planes de alimentación hechos por nutricionistas (Argentina).
Del documento adjunto extraé SOLO lo que esté escrito explícitamente. Si un dato no figura, devolvé null; no lo calcules ni lo inventes.

- weight_kg, height_cm, age, sex ("m"/"f"): datos de la persona si aparecen.
- protein_target: gramos de proteína por día. protein_per_kg: g de proteína por kg de peso.
- kcal_target, carbs_target, fat_target: objetivos diarios si aparecen.
- meals_per_day: cantidad de comidas o ingestas diarias indicadas.
- phase: "volumen" si el objetivo es ganar masa muscular / hipertrofia con superávit, "definicion" si es bajar grasa / déficit, "mantenimiento" si es mantener. null si no queda claro.
- summary: resumen en español rioplatense, máx. 1200 caracteres, pensado para que otra IA evalúe comidas contra este plan. Incluí: objetivos numéricos, distribución por comida, esquema según horario de entrenamiento, porciones de referencia, alimentos recomendados y alimentos a evitar. Formato de líneas cortas, sin markdown.
- missing: una oración corta con los datos importantes que el plan NO indica (por ej. "No indica calorías ni carbohidratos diarios."). Vacío si está todo.
- is_plan: false si el documento no es un plan de alimentación.`;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
  const user = await requireUser(req);
  if (!user) return res.status(401).json({ error: 'No autorizado' });

  const { file, mimeType } = req.body || {};
  if (!file) return res.status(400).json({ error: 'Subí un PDF o una foto del plan.' });
  if (!ALLOWED.includes(mimeType)) return res.status(400).json({ error: 'Formato no soportado. Usá PDF, JPG o PNG.' });

  const { data, error, status } = await geminiJSON({
    parts: [{ inline_data: { mime_type: mimeType, data: file } }, { text: PROMPT }],
    schema: SCHEMA,
    temperature: 0.1,
  });
  if (error) return res.status(status).json({ error });
  if (!data.is_plan) return res.status(422).json({ error: 'El archivo no parece un plan de alimentación.' });

  const pos = (v) => (typeof v === 'number' && v > 0 ? Math.round(v * 10) / 10 : null);
  return res.status(200).json({
    weight_kg: pos(data.weight_kg),
    height_cm: pos(data.height_cm),
    age: pos(data.age),
    sex: data.sex || null,
    protein_target: pos(data.protein_target),
    protein_per_kg: pos(data.protein_per_kg),
    kcal_target: pos(data.kcal_target),
    carbs_target: pos(data.carbs_target),
    fat_target: pos(data.fat_target),
    meals_per_day: pos(data.meals_per_day),
    phase: data.phase || null,
    summary: String(data.summary || '').slice(0, 1500),
    missing: String(data.missing || ''),
  });
}
