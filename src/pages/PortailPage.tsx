import { confirmer } from '@/components/Confirmation';
import { useEffect, useState, useCallback } from 'react';
import { useApp } from '@/stores/app-store';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Acces {
  id: string;
  email: string;
  nom: string | null;
  actif: boolean;
  peut_voir_bilan: boolean;
  peut_voir_resultat: boolean;
  peut_voir_documents: boolean;
  peut_voir_factures: boolean;
  peut_deposer_documents: boolean;
  derniere_connexion: string | null;
  jeton: string;
  created_at: string;
}

export default function PortailPage() {
  const { entreprise, demo } = useApp();
  const [list, setList] = useState<Acces[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ email: '', nom: '', peut_deposer_documents: false });

  const load = useCallback(async () => {
    if (!entreprise || demo) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('portail_acces')
      .select('*')
      .eq('entreprise_id', entreprise.id)
      .order('created_at', { ascending: false });
    if (error) toast.error(error.message);
    else setList((data as Acces[]) || []);
    setLoading(false);
  }, [entreprise, demo]);

  useEffect(() => { load(); }, [load]);

  const invite = async () => {
    if (!entreprise) return;
    if (demo) { toast.info('Mode démo'); return; }
    if (!form.email.includes('@')) { toast.error('Email invalide'); return; }
    const { error } = await supabase.from('portail_acces').insert({
      entreprise_id: entreprise.id,
      email: form.email.toLowerCase().trim(),
      nom: form.nom || null,
      peut_deposer_documents: form.peut_deposer_documents,
    });
    if (error) { toast.error(error.message); return; }
    toast.success(`Invitation portail créée pour ${form.email}`);
    setForm({ email: '', nom: '', peut_deposer_documents: false });
    load();
  };

  const togglePerm = async (a: Acces, field: keyof Acces) => {
    if (demo) return;
    const patch: Record<string, boolean> = { [field]: !a[field] };
    await supabase.from('portail_acces').update(patch as never).eq('id', a.id);
    load();
  };

  const remove = async (a: Acces) => {
    if (!(await confirmer(`Révoquer l'accès de ${a.email} ?`))) return;
    await supabase.from('portail_acces').delete().eq('id', a.id);
    toast.success('Accès révoqué');
    load();
  };

  const copyLink = (a: Acces) => {
    if (!entreprise) return;
    const link = `${window.location.origin}/portail?e=${entreprise.id}&u=${encodeURIComponent(a.email)}&t=${a.jeton}`;
    navigator.clipboard.writeText(link);
    toast.success('Lien portail copié');
  };

  return (
    <div>
      <div className="h-12 bg-bg2 border-b border-border flex items-center justify-between px-5">
        <div className="font-serif text-[17px]">🌐 Portail Client</div>
        <div className="text-[10px] text-fg3 font-mono">{list.length} accès</div>
      </div>

      <div className="p-5 space-y-4">
        {demo && <div className="px-3 py-2 rounded-lg bg-accent/10 text-accent text-xs font-bold">⚡ Mode démo</div>}

        {/* Nouveau */}
        <div className="bg-bg2 border border-border rounded-lg p-4">
          <div className="text-xs font-bold text-primary mb-3">➕ Inviter un client au portail</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input placeholder="email@client.com" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
              className="bg-bg3 border border-border rounded-md px-2.5 py-1.5 text-xs" />
            <input placeholder="Nom (optionnel)" value={form.nom} onChange={e => setForm({ ...form, nom: e.target.value })}
              className="bg-bg3 border border-border rounded-md px-2.5 py-1.5 text-xs" />
            <label className="flex items-center gap-2 text-xs text-fg2">
              <input type="checkbox" checked={form.peut_deposer_documents}
                onChange={e => setForm({ ...form, peut_deposer_documents: e.target.checked })} />
              Autoriser dépôt de documents
            </label>
          </div>
          <button onClick={invite} disabled={demo}
            className="mt-3 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 disabled:opacity-50">
            📧 Créer l'accès
          </button>
        </div>

        {/* Liste */}
        <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-bg3">
              <tr className="text-fg3 uppercase text-[9px] font-mono tracking-wider">
                <th className="p-2 text-left">Client</th>
                <th className="p-2 text-center">Bilan</th>
                <th className="p-2 text-center">Résultat</th>
                <th className="p-2 text-center">Documents</th>
                <th className="p-2 text-center">Factures</th>
                <th className="p-2 text-center">Dépôt</th>
                <th className="p-2 text-center">Actif</th>
                <th className="p-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={8} className="p-4 text-center text-fg3">Chargement…</td></tr>}
              {!loading && list.length === 0 && (
                <tr><td colSpan={8} className="p-4 text-center text-fg3">Aucun accès configuré</td></tr>
              )}
              {list.map(a => (
                <tr key={a.id} className="border-t border-border">
                  <td className="p-2">
                    <div className="font-semibold text-foreground">{a.nom || a.email}</div>
                    <div className="text-[10px] text-fg3 font-mono">{a.email}</div>
                  </td>
                  {(['peut_voir_bilan','peut_voir_resultat','peut_voir_documents','peut_voir_factures','peut_deposer_documents','actif'] as const).map(k => (
                    <td key={k} className="p-2 text-center">
                      <button onClick={() => togglePerm(a, k)} disabled={demo}
                        className={`w-8 h-4 rounded-full transition-colors ${a[k] ? 'bg-primary' : 'bg-bg3 border border-border'}`}>
                        <span className={`block w-3 h-3 rounded-full bg-white transition-transform ${a[k] ? 'translate-x-4' : 'translate-x-0.5'}`} />
                      </button>
                    </td>
                  ))}
                  <td className="p-2 text-right space-x-1">
                    <button onClick={() => copyLink(a)} className="px-2 py-0.5 rounded text-[10px] border border-border hover:bg-bg3">🔗</button>
                    <button onClick={() => remove(a)} className="px-2 py-0.5 rounded text-[10px] border border-destructive/30 text-destructive hover:bg-destructive/10">✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="text-[10px] text-fg3 space-y-1">
          <p>💡 <strong>Portail client</strong> : chaque client invité recevra un lien pour consulter en lecture seule ses états financiers, ses documents et ses factures.</p>
          <p>🔐 Sécurité : accès isolé par entreprise via RLS ; le lien contient un code secret propre à chaque client — ne le partagez qu'avec lui.</p>
        </div>
      </div>
    </div>
  );
}
