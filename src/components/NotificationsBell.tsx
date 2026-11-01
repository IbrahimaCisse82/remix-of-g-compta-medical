import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useApp } from '@/stores/app-store';

type Notif = {
  id: string;
  type: string;
  titre: string;
  message: string | null;
  lien: string | null;
  read_at: string | null;
  created_at: string;
};

/** Centre de notifications (échéances, validations, DGID). */
export default function NotificationsBell() {
  const { entreprise, demo } = useApp();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notif[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  const charger = useCallback(async () => {
    if (!entreprise?.id || demo) return;
    const { data } = await supabase
      .from('notifications')
      .select('id, type, titre, message, lien, read_at, created_at')
      .eq('entreprise_id', entreprise.id)
      .order('created_at', { ascending: false })
      .limit(30);
    if (data) setItems(data as Notif[]);
  }, [entreprise?.id, demo]);

  useEffect(() => { charger(); }, [charger]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const nonLues = items.filter(n => !n.read_at).length;

  const marquerLues = async () => {
    if (!entreprise?.id) return;
    const ids = items.filter(n => !n.read_at).map(n => n.id);
    if (ids.length === 0) return;
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).in('id', ids);
    setItems(prev => prev.map(n => (n.read_at ? n : { ...n, read_at: new Date().toISOString() })));
  };

  if (demo || !entreprise) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => { setOpen(o => !o); if (!open) charger(); }}
        title="Notifications"
        aria-label={`Notifications${nonLues ? ` (${nonLues} non lues)` : ''}`}
        className="relative px-2 py-1 rounded-md text-xs border border-border text-fg2 hover:bg-bg3"
      >
        🔔
        {nonLues > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[15px] h-[15px] px-1 rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground flex items-center justify-center">
            {nonLues > 9 ? '9+' : nonLues}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-1 w-[320px] max-h-[60vh] overflow-y-auto bg-bg2 border border-border rounded-lg shadow-lg z-50">
          <div className="px-3 py-2 border-b border-border flex items-center justify-between">
            <span className="text-[11px] font-semibold">Notifications</span>
            <button onClick={marquerLues} className="text-[10px] text-primary hover:underline">Tout marquer lu</button>
          </div>
          {items.length === 0 && (
            <p className="px-3 py-4 text-[11px] text-fg3">Aucune notification.</p>
          )}
          {items.map(n => (
            <div key={n.id} className={`px-3 py-2 border-b border-border/40 ${n.read_at ? '' : 'bg-primary/5'}`}>
              <div className="text-[11px] font-semibold">{n.titre}</div>
              {n.message && <div className="text-[10px] text-fg3 mt-0.5">{n.message}</div>}
              <div className="text-[9px] text-fg3 font-mono mt-1">
                {new Date(n.created_at).toLocaleString('fr-FR')}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
