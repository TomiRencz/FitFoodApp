import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { compressImage } from '../lib/image';

const MAX_BYTES = 3 * 1024 * 1024; // Vercel acepta ~4,5 MB por request; en base64 un archivo crece un 33 %

export default function PlanUpload({ source, uploadedAt, summary, note, onParsed, onRemove }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);

  async function onPick(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');

    let payload;
    try {
      if (file.type.startsWith('image/')) {
        const img = await compressImage(file, 1800, 0.85);
        payload = { file: img.base64, mimeType: 'image/jpeg' };
      } else if (file.type === 'application/pdf') {
        if (file.size > MAX_BYTES) return setError('El PDF pesa más de 3 MB. Probá exportarlo más liviano o sacale fotos a las páginas.');
        payload = { file: await toBase64(file), mimeType: 'application/pdf' };
      } else {
        return setError('Subí el plan en PDF o como foto.');
      }
    } catch {
      return setError('No se pudo leer el archivo.');
    }

    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/parse-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || (res.status === 413 ? 'El archivo es muy pesado.' : 'No se pudo leer el plan.'));
      onParsed(data, file.name);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const fileInput = (
    <input type="file" accept="application/pdf,image/*" onChange={onPick} disabled={loading} />
  );

  if (summary) {
    return (
      <div className="plan-card has-plan">
        <div className="plan-head">
          <span className="plan-ico" aria-hidden>📄</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="plan-title">Plan de tu nutricionista</div>
            <div className="tiny muted plan-file">
              {source || 'Plan cargado'}
              {uploadedAt ? `, ${new Date(uploadedAt).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}` : ''}
            </div>
          </div>
        </div>
        {note && <p className="small plan-note">{note}</p>}
        <p className="tiny muted" style={{ margin: '8px 0 0' }}>
          La app usa este plan para tus objetivos y para comentar cada comida.
        </p>
        {open && <pre className="plan-summary">{summary}</pre>}
        {error && <div className="error">{error}</div>}
        <div className="plan-actions">
          <button type="button" className="link-btn" onClick={() => setOpen(!open)}>{open ? 'Ocultar resumen' : 'Ver resumen'}</button>
          <label className={`link-btn ${loading ? 'is-loading' : ''}`}>
            {loading ? 'Leyendo…' : 'Reemplazar'}
            {fileInput}
          </label>
          <button type="button" className="link-btn danger" onClick={onRemove} disabled={loading}>Quitar</button>
        </div>
      </div>
    );
  }

  return (
    <div className="plan-card">
      <div className="plan-title">¿Tenés un plan de tu nutricionista?</div>
      <p className="small muted" style={{ margin: '4px 0 14px' }}>
        Subí el PDF o una foto y completamos tus objetivos con sus números. También lo usamos para comentar tus comidas.
      </p>
      {error && <div className="error">{error}</div>}
      <label className={`btn btn-ghost btn-block plan-upload ${loading ? 'is-loading' : ''}`}>
        {loading ? <><span className="spinner sm" /> Leyendo el plan…</> : 'Subir plan (PDF o foto)'}
        {fileInput}
      </label>
    </div>
  );
}

function toBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
