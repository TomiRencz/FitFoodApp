// Carga comidas y pesos de un rango y calcula el seguimiento.
import { useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase';
import { buildDays, summarize, byMealType, topFoods, weightChange } from './stats';

export function useTracking({ from, to, profile, reloadKey }) {
  const [meals, setMeals] = useState([]);
  const [weights, setWeights] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const start = new Date(from + 'T00:00:00').toISOString();
    const end = new Date(to + 'T23:59:59.999').toISOString();
    Promise.all([
      supabase.from('meals').select('id,eaten_at,meal_type,title,kcal,protein,carbs,fat,items')
        .gte('eaten_at', start).lte('eaten_at', end).order('eaten_at', { ascending: true }).limit(2000),
      supabase.from('weights').select('logged_on,kg').order('logged_on', { ascending: true }).limit(500),
    ]).then(([m, w]) => {
      if (!alive) return;
      setMeals(m.data || []);
      setWeights(w.data || []);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [from, to, reloadKey]);

  const perMealGoal = Math.round((profile?.protein_target || 160) / (profile?.meals_per_day || 4));

  const data = useMemo(() => {
    const days = buildDays(meals, from, to);
    return {
      days,
      summary: summarize(days, profile),
      mealTypes: byMealType(meals, perMealGoal),
      foods: topFoods(meals),
      weight: weightChange(weights, from, to),
      allWeights: weights,
    };
  }, [meals, weights, from, to, profile, perMealGoal]);

  return { ...data, meals, loading, perMealGoal };
}
