// POST /api/analyze
// Recibe una foto (base64) y/o una descripción en texto, y devuelve los alimentos
// detectados con gramos estimados y valores nutricionales cada 100 g.
import { requireUser, geminiJSON } from '../../lib/server';

export const config = { api: { bodyParser: { sizeLimit: '6mb' } } };

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    is_food: { type: 'BOOLEAN' },
    title: { type: 'STRING' },
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          grams: { type: 'NUMBER' },
          kcal_100: { type: 'NUMBER' },
          protein_100: { type: 'NUMBER' },
          carbs_100: { type: 'NUMBER' },
          fat_100: { type: 'NUMBER' },
          confidence: { type: 'STRING', enum: ['alta', 'media', 'baja'] },
        },
        required: ['name', 'grams', 'kcal_100', 'protein_100', 'carbs_100', 'fat_100', 'confidence'],
      },
    },
    feedback: { type: 'STRING' },
  },
  required: ['is_food', 'title', 'items', 'feedback'],
};

function buildPrompt({ text, mealType, ctx = {} }) {
  const phaseTxt = {
    volumen: 'VOLUMEN (superávit calórico para ganar músculo)',
    definicion: 'DEFINICIÓN (déficit calórico para bajar grasa manteniendo el músculo)',
    mantenimiento: 'MANTENIMIENTO',
  }[ctx.phase] || 'no especificada';

  return `Sos un nutricionista deportivo argentino que estima el contenido nutricional de comidas.

TAREA
- Identificá cada alimento visible${text ? ' y/o descripto por el usuario' : ''}.
- Estimá los GRAMOS de cada uno tal como está servido (peso en cocido si está cocido). Usá referencias visuales: tamaño del plato (~26 cm), cubiertos, manos, envases.
- Para cada alimento dá kcal, proteína, carbohidratos y grasa CADA 100 g en el estado en que está (cocido, frito, crudo), usando valores de tablas estándar (ARGENFOODS / USDA).
- Incluí como ítems separados lo que sume calorías aunque se vea poco: aceite de cocción o aderezo (estimá ~5-10 g si hay brillo o fritura), salsas, queso rallado, pan.
- Usá nombres en español rioplatense y concretos ("Milanesa de carne al horno", "Arroz yamaní cocido", "Pechuga de pollo grillada").
- confidence: "alta" si el alimento y la porción son claros, "media" si dudás de la porción, "baja" si dudás del alimento.
- Si el usuario indica cantidades o marcas en el texto, respetalas por sobre lo que ves.
- Si la imagen no es comida, devolvé is_food=false e items vacío.
- title: nombre corto del plato (máx. 5 palabras).

CONTEXTO DEL USUARIO
- Momento: ${mealType || 'no indicado'}
- Etapa: ${phaseTxt}
- Objetivo de proteína por comida: ~${ctx.proteinPerMeal || 42} g
${ctx.phaseInfo ? `- Momento de la etapa: ${ctx.phaseInfo}` : ''}
${ctx.experience ? `- Experiencia entrenando: ${ctx.experience}` : ''}
${ctx.style ? `- Según su plan, esta comida debería ser: ${ctx.style}` : ''}
${ctx.remaining ? `- Le quedan para hoy (antes de esta comida): ${Math.round(ctx.remaining.kcal)} kcal, ${Math.round(ctx.remaining.protein)} g de proteína` : ''}

${ctx.plan ? `PLAN DE SU NUTRICIONISTA (usalo como referencia principal para el feedback):\n${String(ctx.plan).slice(0, 1500)}\n` : ''}
feedback: 1 o 2 oraciones cortas, en tono amigable y directo (voseo), sobre cómo encaja esta comida con su etapa y su objetivo de proteína. Si falta proteína, sugerí algo concreto para sumar${ctx.plan ? ' (preferí alimentos que estén en su plan)' : ''}. Si incluye algo que su plan dice evitar, mencionalo sin retar. Nada de sermones.
${text ? `\nDESCRIPCIÓN DEL USUARIO: "${String(text).slice(0, 500)}"` : ''}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
  const user = await requireUser(req);
  if (!user) return res.status(401).json({ error: 'No autorizado' });

  const { image, text, mealType, context } = req.body || {};
  if (!image && !text) return res.status(400).json({ error: 'Mandá una foto o una descripción' });

  const parts = [];
  if (image) parts.push({ inline_data: { mime_type: 'image/jpeg', data: image } });
  parts.push({ text: buildPrompt({ text, mealType, ctx: context }) });

  try {
    const { data: parsed, error, status } = await geminiJSON({ parts, schema: RESPONSE_SCHEMA });
    if (error) return res.status(status).json({ error });

    // Normalizamos y calculamos los totales de cada ítem acá (no confiamos en la cuenta del modelo)
    const n = (v) => Math.max(0, Number(v) || 0);
    const items = (parsed.items || []).map((i) => {
      const grams = Math.max(0, Math.round(Number(i.grams) || 0));
      const f = grams / 100;
      return {
        name: String(i.name || 'Alimento'),
        confidence: i.confidence || 'media',
        kcal_100: n(i.kcal_100),
        protein_100: n(i.protein_100),
        carbs_100: n(i.carbs_100),
        fat_100: n(i.fat_100),
        grams,
        kcal: Math.round(n(i.kcal_100) * f * 10) / 10,
        protein: Math.round(n(i.protein_100) * f * 10) / 10,
        carbs: Math.round(n(i.carbs_100) * f * 10) / 10,
        fat: Math.round(n(i.fat_100) * f * 10) / 10,
      };
    });

    return res.status(200).json({
      is_food: parsed.is_food !== false,
      title: parsed.title || 'Comida',
      items,
      feedback: parsed.feedback || '',
    });
  } catch (e) {
    return res.status(500).json({ error: 'No se pudo analizar la comida. Revisá tu conexión.' });
  }
}
