import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { dayRange, isToday, localDateKey } from '../lib/dates';
import { sumItems, suggestTargets, PHASES } from '../lib/nutrition';
import AuthScreen from '../components/AuthScreen';
import GoalsForm from '../components/GoalsForm';
import TodayView from '../components/TodayView';
import HistoryView from '../components/HistoryView';
import SettingsView from '../components/SettingsView';
import MealEditor from '../components/MealEditor';
import PhaseView from '../components/PhaseView';
import RecordsView from '../components/RecordsView';

export default function Home() {
  const [session, setSession] = useState(undefined); // undefined = cargando
  const [profile, setProfile] = useState(undefined);
  const [tab, setTab] = useState('hoy');
  const [date, setDate] = useState(() => new Date());
  const [meals, setMeals] = useState([]);
  const [mealsLoading, setMealsLoading] = useState(true);
  const [photoUrls, setPhotoUrls] = useState({});
  const [editor, setEditor] = useState(null); // null | { meal? }
  const [toast, setToast] = useState('');
  const [phaseOpen, setPhaseOpen] = useState(false);
  const [recordsOpen, setRecordsOpen] = useState(false);
  const [dataVersion, setDataVersion] = useState(0); // sube cuando cambian los registros

  const userId = session?.user?.id;

  // ---------- Sesión ----------
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  // ---------- Perfil ----------
  useEffect(() => {
    if (!userId) { setProfile(undefined); return; }
    supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
      .then(({ data }) => setProfile(data || null));
  }, [userId]);

  // ---------- Comidas del día ----------
  const loadMeals = useCallback(async () => {
    if (!userId) return;
    setMealsLoading(true);
    const { start, end } = dayRange(date);
    const { data } = await supabase.from('meals').select('*')
      .gte('eaten_at', start).lt('eaten_at', end).order('eaten_at', { ascending: true });
    const list = data || [];
    setMeals(list);
    setMealsLoading(false);

    const paths = list.map((m) => m.photo_path).filter((p) => p && !photoUrls[p]);
    if (paths.length) {
      const { data: signed } = await supabase.storage.from('meal-photos').createSignedUrls(paths, 60 * 60 * 24);
      if (signed) {
        setPhotoUrls((prev) => {
          const next = { ...prev };
          signed.forEach((s) => { if (s.signedUrl) next[s.path] = s.signedUrl; });
          return next;
        });
      }
    }
  }, [userId, date]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (profile) loadMeals(); }, [profile, loadMeals]);

  const totals = useMemo(() => sumItems(meals), [meals]);

  function flash(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 2200);
  }

  // Pasa a la etapa siguiente: arranca hoy, recalcula kcal/HC/grasa y mantiene la proteína
  async function advancePhase() {
    const nextPhase = profile.next_phase;
    if (!nextPhase) return;
    const s = suggestTargets({ ...profile, phase: nextPhase });
    const protein = profile.protein_target;
    const update = {
      phase: nextPhase,
      phase_started_on: localDateKey(new Date()),
      phase_planned_weeks: profile.next_phase_weeks || null,
      next_phase: null,
      next_phase_weeks: null,
      updated_at: new Date().toISOString(),
    };
    if (s) {
      update.kcal_target = s.kcal;
      update.fat_target = s.fat;
      update.carbs_target = Math.max(0, Math.round((s.kcal - protein * 4 - s.fat * 9) / 4));
    }
    const { data, error } = await supabase.from('profiles').update(update).eq('id', userId).select().single();
    if (error) return flash('No se pudo actualizar la etapa');
    setProfile(data);
    flash(`Arrancaste ${PHASES[nextPhase].label.toLowerCase()}. Revisá tus objetivos en Ajustes.`);
  }

  // Abre un día puntual en la pestaña Hoy
  function openDay(d) {
    setPhaseOpen(false);
    setRecordsOpen(false);
    setDate(new Date(d));
    setTab('hoy');
    window.scrollTo(0, 0);
  }

  function closeEditor(msg) {
    setEditor(null);
    if (typeof msg === 'string') { flash(msg); dataChanged(); }
  }

  function dataChanged() {
    loadMeals();
    setDataVersion((v) => v + 1);
  }

  // ---------- Render ----------
  if (session === undefined || (session && profile === undefined)) {
    return <div className="loader"><div className="spinner" /></div>;
  }
  if (!session) return <AuthScreen />;
  if (!profile || !profile.protein_target) {
    return (
      <div className="app" style={{ paddingBottom: 40 }}>
        <GoalsForm onboarding userId={userId} profile={profile} onSaved={setProfile} />
      </div>
    );
  }

  // Totales del día sin la comida que se está editando (para calcular lo que queda)
  const totalsExcluding = editor?.meal ? sumItems(meals.filter((m) => m.id !== editor.meal.id)) : totals;
  const defaultDate = isToday(date) ? new Date() : (() => { const d = new Date(date); d.setHours(13, 0, 0, 0); return d; })();

  return (
    <>
      {toast && <div className="toast" role="status">{toast}</div>}
      <main className="app">
        {tab === 'hoy' && (
          <TodayView profile={profile} meals={meals} totals={totals} photoUrls={photoUrls} loading={mealsLoading}
            date={date} setDate={setDate} onOpenMeal={(meal) => setEditor({ meal })} onAdvancePhase={advancePhase} onOpenPhase={() => setPhaseOpen(true)} />
        )}
        {tab === 'historial' && <HistoryView key={dataVersion} profile={profile} userId={userId} onToast={flash} onOpenDay={openDay} onOpenRecords={() => setRecordsOpen(true)} />}
        {tab === 'ajustes' && (
          <SettingsView userId={userId} email={session.user.email} profile={profile} onOpenRecords={() => setRecordsOpen(true)}
            onSaved={(p) => { setProfile(p); flash('Objetivos guardados'); }} />
        )}
      </main>

      <nav className="dock" aria-label="Navegación">
        <div className="dock-inner">
          {tab === 'hoy' && (
            <button className="btn btn-primary capture-btn" onClick={() => setEditor({})}>
              📷  Cargar comida
            </button>
          )}
          <div className="tabs">
            <Tab id="hoy" ico="🍽️" label="Hoy" tab={tab} setTab={setTab} />
            <Tab id="historial" ico="📊" label="Historial" tab={tab} setTab={setTab} />
            <Tab id="ajustes" ico="⚙️" label="Ajustes" tab={tab} setTab={setTab} />
          </div>
        </div>
      </nav>

      {phaseOpen && (
        <PhaseView key={dataVersion} profile={profile} onClose={() => setPhaseOpen(false)} onOpenDay={openDay}
          onEditPhase={() => { setPhaseOpen(false); setTab('ajustes'); window.scrollTo(0, 0); }} />
      )}

      {recordsOpen && (
        <RecordsView userId={userId} reloadKey={dataVersion} onToast={flash} onChanged={dataChanged}
          onClose={() => setRecordsOpen(false)}
          onOpenMeal={(meal, url) => setEditor({ meal, photoUrl: url })} />
      )}

      {editor && (
        <MealEditor
          userId={userId}
          profile={profile}
          meal={editor.meal}
          photoUrl={editor.photoUrl || (editor.meal?.photo_path ? photoUrls[editor.meal.photo_path] : null)}
          defaultDate={defaultDate}
          dayTotals={totalsExcluding}
          onClose={() => closeEditor()}
          onSaved={closeEditor}
          onDeleted={closeEditor}
        />
      )}
    </>
  );
}

function Tab({ id, ico, label, tab, setTab }) {
  return (
    <button className={`tab ${tab === id ? 'on' : ''}`} onClick={() => setTab(id)} aria-current={tab === id ? 'page' : undefined}>
      <span className="ico">{ico}</span>{label}
    </button>
  );
}
