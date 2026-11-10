import { createClient } from '@supabase/supabase-js';
import { useEffect, useState, useCallback } from 'react';

export const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'familie-auth' },
});

// Eine ganze Tabelle laden und live halten (Supabase Realtime).
// Die Familie hat wenige Daten, deshalb wird immer alles geladen.
export function useTable(table, enabled = true) {
  const [rows, setRows] = useState([]);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    const { data, error } = await supabase.from(table).select('*');
    if (!error) { setRows(data || []); setLoaded(true); }
  }, [table]);

  useEffect(() => {
    if (!enabled) return undefined;
    reload();
    const key = (r) => r.id ?? `${r.kid}|${r.on_date}|${r.item_key}`;
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
