// Utilidades solo para las rutas /api (servidor)
import { createClient } from '@supabase/supabase-js';

export const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';

// Solo usuarios logueados pueden usar la API key de Gemini
export async function requireUser(req) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return null;
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

// Llama a Gemini pidiendo JSON con un esquema. Devuelve { data } o { error, status }.
export async function geminiJSON({ parts, schema, temperature = 0.2 }) {
  if (!process.env.GEMINI_API_KEY) return { error: 'Falta GEMINI_API_KEY', status: 500 };
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: { temperature, responseMimeType: 'application/json', responseSchema: schema },
      }),
    }
  );
  const json = await r.json();
  if (!r.ok) {
    if (r.status === 429) return { error: 'Se alcanzó el límite gratuito de análisis por ahora. Probá en un rato.', status: 429 };
    return { error: json?.error?.message || 'Error de Gemini', status: 502 };
  }
  const raw = json?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
  try {
    return { data: JSON.parse(raw) };
  } catch {
    return { error: 'No pude interpretar la respuesta. Probá de nuevo.', status: 502 };
  }
}
