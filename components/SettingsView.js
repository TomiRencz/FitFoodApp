import GoalsForm from './GoalsForm';
import { supabase } from '../lib/supabase';

export default function SettingsView({ userId, email, profile, onSaved }) {
  return (
    <>
      <h1 className="h1" style={{ marginBottom: 6 }}>Ajustes</h1>
      <p className="small muted" style={{ marginTop: 0, marginBottom: 22 }}>
        Si cargás cuánto dura tu etapa y qué sigue, la app te avisa cuando toca el cambio y recalcula las calorías.
      </p>

      <GoalsForm key={profile?.updated_at} userId={userId} profile={profile} onSaved={onSaved} />

      <div className="panel" style={{ marginTop: 28 }}>
        <h2 className="h2" style={{ marginBottom: 6 }}>Instalar en el celu</h2>
        <p className="small muted" style={{ margin: 0 }}>
          iPhone: abrí la app en Safari, tocá Compartir y después “Agregar a inicio”.
          Android: en Chrome, menú ⋮ y “Instalar app”.
        </p>
      </div>

      <div style={{ marginTop: 18, textAlign: 'center' }}>
        <p className="tiny muted">Sesión iniciada como {email}</p>
        <button className="btn btn-ghost" onClick={() => supabase.auth.signOut()}>Cerrar sesión</button>
      </div>
    </>
  );
}
