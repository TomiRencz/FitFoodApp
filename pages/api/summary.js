// POST /api/summary
// Recibe estadísticas ya calculadas en el celu (no comidas crudas) y devuelve
// un resumen corto, qué salió bien y en qué enfocarse.
import { requireUser, geminiJSON } from '../../lib/server';

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    summary: { type: 'STRING' },
    wins: { type: 'ARRAY', items: { type: 'STRING' } },
    focus: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['summary', 'wins', 'focus'],
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
  const user = await requireUser(req);
  if (!user) return res.status(401).json({ error: 'No autorizado' });

  const { stats, plan } = req.body || {};
  if (!stats) return res.status(400).json({ error: 'Faltan datos' });

  const prompt = `Sos un nutricionista deportivo argentino. Analizá este período de registro de comidas y escribí un resumen breve en español rioplatense, con voseo, tono directo y motivador sin exagerar. No inventes datos que no estén abajo.

DATOS DEL PERÍODO (JSON):
${JSON.stringify(stats).slice(0, 6000)}
${plan ? `\nPLAN DE SU NUTRICIONISTA:\n${String(plan).slice(0, 1500)}` : ''}

Devolvé:
- summary: 2 o 3 oraciones con la foto general del período (proteína, calorías vs. la etapa, constancia de registro, peso si hay datos).
- wins: 1 a 3 puntos cortos (máx. 12 palabras) de lo que salió bien.
- focus: 1 a 3 acciones concretas (máx. 14 palabras) para el próximo período. Si una comida suele quedarse corta de proteína, decí cuál y qué sumar.
Si hay pocos días registrados, decilo y priorizá registrar más.`;

  const { data, error, status } = await geminiJSON({ parts: [{ text: prompt }], schema: SCHEMA, temperature: 0.4 });
  if (error) return res.status(status).json({ error });
  return res.status(200).json({
    summary: String(data.summary || ''),
    wins: (data.wins || []).slice(0, 3).map(String),
    focus: (data.focus || []).slice(0, 3).map(String),
  });
}
