import { createClient } from '@supabase/supabase-js';
import { useEffect, useState, useCallback } from 'react';

export const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'familie-auth' },
});

// Eine ganze Tabelle laden und live halten (Supabase Realtime).
// Die Familie hat wenige Daten, deshalb wird immer alles geladen.
// keyOf: eindeutiger Schlüssel einer Zeile (Standard: id)
export function useTable(table, keyOf = null) {
  const enabled = true;
  const [rows, setRows] = useState([]);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    const { data, error } = await supabase.from(table).select('*');
    if (!error) { setRows(data || []); setLoaded(true); }
  }, [table]);

  useEffect(() => {
    if (!enabled) return undefined;
    reload();
    const key = keyOf || ((r) => r.id ?? `${r.kid}|${r.on_date}|${r.item_key}`);
    const ch = supabase
      .channel(`t-${table}`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, (p) => {
        setRows((cur) => {
          if (p.eventType === 'DELETE') return cur.filter((r) => key(r) !== key(p.old));
          const without = cur.filter((r) => key(r) !== key(p.new));
          return [...without, p.new];
        });
      })
      .subscribe();
    // Nach dem Aufwachen des Geräts alles frisch laden
    const onVis = () => { if (document.visibilityState === 'visible') reload(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { supabase.removeChannel(ch); document.removeEventListener('visibilitychange', onVis); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, enabled, reload]);

  // Sofort lokal anzeigen, dann speichern (bei Fehler neu laden)
  const local = useCallback((fn) => setRows(fn), []);
  return { rows, loaded, reload, local };
}

export async function run(promise, onError) {
  const { data, error } = await promise;
  if (error) {
    onError?.(error.message.includes('row-level security') ? 'Keine Berechtigung.' : error.message);
    return null;
  }
  return data ?? true;
}

// Tabellen für Phase 3 (Zuhause, Betreuung, Abos) – auch von der Station genutzt
export function useHomeTables() {
  return {
    meals: useTable('meals', (r) => r.on_date),
    recipes: useTable('recipes'),
    wishes: useTable('meal_wishes'),
    laundry: useTable('laundry_log'),
    chores: useTable('chores'),
    choreChecks: useTable('chore_checks', (r) => `${r.chore_id}|${r.on_date}`),
    areas: useTable('cleaning_areas'),
    areaChecks: useTable('cleaning_checks', (r) => `${r.area_id}|${r.week_start}`),
    notes: useTable('cleaning_notes'),
    settings: useTable('settings', (r) => r.key),
    caregivers: useTable('caregivers'),
    care: useTable('care_needs'),
    asks: useTable('care_asks', (r) => `${r.need_id}|${r.caregiver_id}`),
    subs: useTable('calendar_subscriptions'),
    shopSections: useTable('shop_sections', (r) => r.name),
    timetables: useTable('timetables', (r) => r.kid),
    checkins: useTable('checkins', (r) => r.sonntag),
  };
}


// Gelernte Einkaufs-Kategorien als { name: Kategorie }
export function learnedSections(data) {
  return Object.fromEntries((data.shopSections?.rows || []).map((r) => [r.name, r.section]));
}
