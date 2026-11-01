import { useEffect, useState, useCallback } from 'react';
import { useApp } from '@/stores/app-store';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/use-user-role';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface JournalRow {
  id: string;
  date_ecriture: string;
  piece: string;
  journal_code: string;
  libelle: string;
  compte: string;
  intitule: string;
  debit: number;
  credit: number;
  statut_validation: string;
  soumis_le: string | null;
  valide_le: string | null;
  motif_refus: string | null;
}

const STATUTS = [
  { id: 'brouillon', label: 'Brouillon', color: 'text-fg3 bg-bg3' },
  { id: 'soumis', label: 'Soumis', color: 'text-accent bg-accent/10' },
  { id: 'valide', label: 'Validé', color: 'text-primary bg-primary/10' },
  { id: 'refuse', label: 'Refusé', color: 'text-destructive bg-destructive/10' },
];

export default function ValidationPage() {
  const { entreprise, exercice, demo } = useApp();
  const { user } = useAuth();
  const { canWrite } = useUserRole();
  const [rows, setRows] = useState<JournalRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<string>('soumis');

  const load = useCallback(async () => {
    if (!entreprise || !exercice || demo) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('journal')
      .select('*')
      .eq('entreprise_id', entreprise.id)
      .eq('exercice_id', exercice.id)
      .order('date_ecriture', { ascending: false })
      .limit(500);
    if (error) toast.error(error.message);
    else setRows((data as any) || []);
    setLoading(false);
  }, [entreprise, exercice, demo]);

  useEffect(() => { load(); }, [load]);

  const groupByPiece = () => {
    const map = new Map<string, JournalRow[]>();
    for (const r of rows) {
      if (r.statut_validation !== tab) continue;
      const k = r.piece || r.id;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(r);
    }
    return Array.from(map.entries());
  };

  const changeStatus = async (piece: string, newStatus: string, motif?: string) => {
    if (!entreprise || !user) return;
    const now = new Date().toISOString();
    const updates: any = { statut_validation: newStatus };
    if (newStatus === 'soumis') { updates.soumis_par = user.id; updates.soumis_le = now; }
    if (newStatus === 'valide') { updates.valide_par = user.id; updates.valide_le = now; updates.motif_refus = null; }
    if (newStatus === 'refuse') { updates.valide_par = user.id; updates.valide_le = now; updates.motif_refus = motif || 'Non spécifié'; }
    if (newStatus === 'brouillon') { updates.soumis_le = null; updates.valide_le = null; updates.motif_refus = null; }

    const { error } = await supabase
      .from('journal')
      .update(updates)
      .eq('entreprise_id', entreprise.id)
      .eq('piece', piece);
    if (error) { toast.error(error.message); return; }

    // Notification du circuit de validation (cloche + email si configuré)
    const libelles: Record<string, { titre: string; message: string }> = {
      soumis: { titre: 'Pièce soumise à validation', message: `La pièce ${piece} attend une validation.` },
      valide: { titre: 'Pièce validée', message: `La pièce ${piece} a été validée.` },
      refuse: { titre: 'Pièce refusée', message: `La pièce ${piece} a été refusée. Motif : ${motif || 'Non spécifié'}` },
    };
    const notif = libelles[newStatus];
    if (notif) {
      try {
        await supabase.functions.invoke('send-notification', {
          body: {
            entreprise_id: entreprise.id,
            type: `validation_${newStatus}`,
            titre: notif.titre,
            message: notif.message,
            lien: '/validation',
            meta: { piece },
          },
        });
      } catch { /* notification non bloquante */ }
    }

    toast.success(`Pièce ${piece} → ${newStatus}`);
    load();
  };

  const counts = STATUTS.reduce((acc, s) => {
    acc[s.id] = new Set(rows.filter(r => r.statut_validation === s.id).map(r => r.piece)).size;
    return acc;
  }, {} as Record<string, number>);

  const groups = groupByPiece();

  return (
    <div>
      <div className="h-12 bg-bg2 border-b border-border flex items-center justify-between px-5">
        <div className="font-serif text-[17px]">✅ Workflow de Validation</div>
      </div>

      <div className="p-5 space-y-4">
        {demo && <div className="px-3 py-2 rounded-lg bg-accent/10 text-accent text-xs font-bold">⚡ Mode démo</div>}

        {/* Tabs */}
        <div className="flex gap-1 border-b border-border">
          {STATUTS.map(s => (
            <button key={s.id} onClick={() => setTab(s.id)}
              className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors ${
                tab === s.id ? 'border-primary text-primary' : 'border-transparent text-fg3 hover:text-foreground'
              }`}>
              {s.label} <span className="ml-1 text-[10px] font-mono">({counts[s.id] || 0})</span>
            </button>
          ))}
        </div>

        {loading && <div className="text-center py-8 text-fg3 text-xs">Chargement…</div>}

        {!loading && groups.length === 0 && (
          <div className="text-center py-12 text-fg3 text-xs">Aucune pièce {tab}</div>
        )}

        {groups.map(([piece, lines]) => {
          const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
          const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
          const first = lines[0];
          return (
            <div key={piece} className="bg-bg2 border border-border rounded-lg overflow-hidden">
              <div className="bg-bg3 px-3 py-2 flex items-center justify-between text-xs">
                <div>
                  <span className="font-bold text-primary">📎 {piece}</span>
                  <span className="ml-3 text-fg3 font-mono">{first.date_ecriture}</span>
                  <span className="ml-3 text-fg2">{first.libelle}</span>
                </div>
                <div className="flex items-center gap-2">
                  {first.motif_refus && (
                    <span className="text-[10px] text-destructive">⚠ {first.motif_refus}</span>
                  )}
                  {canWrite && !demo && tab === 'brouillon' && (
                    <button onClick={() => changeStatus(piece, 'soumis')}
                      className="px-2 py-1 rounded text-[10px] bg-accent text-accent-foreground font-bold">📤 Soumettre</button>
                  )}
                  {canWrite && !demo && tab === 'soumis' && (
                    <>
                      <button onClick={() => changeStatus(piece, 'valide')}
                        className="px-2 py-1 rounded text-[10px] bg-primary text-primary-foreground font-bold">✓ Valider</button>
                      <button onClick={() => {
                        const m = prompt('Motif du refus :');
                        if (m) changeStatus(piece, 'refuse', m);
                      }} className="px-2 py-1 rounded text-[10px] border border-destructive/30 text-destructive">✕ Refuser</button>
                    </>
                  )}
                  {canWrite && !demo && (tab === 'refuse' || tab === 'valide') && (
                    <button onClick={() => changeStatus(piece, 'brouillon')}
                      className="px-2 py-1 rounded text-[10px] border border-border">↩ Rouvrir</button>
                  )}
                </div>
              </div>
              <table className="w-full text-xs">
                <tbody>
                  {lines.map(l => (
                    <tr key={l.id} className="border-t border-border/50">
                      <td className="p-1.5 font-mono w-24">{l.compte}</td>
                      <td className="p-1.5 text-fg2">{l.intitule}</td>
                      <td className="p-1.5 text-right font-mono w-28">{l.debit ? l.debit.toLocaleString('fr-FR') : ''}</td>
                      <td className="p-1.5 text-right font-mono w-28">{l.credit ? l.credit.toLocaleString('fr-FR') : ''}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-border bg-bg3 font-bold">
                    <td colSpan={2} className="p-1.5 text-right text-fg3 text-[10px]">TOTAL</td>
                    <td className="p-1.5 text-right font-mono">{totalDebit.toLocaleString('fr-FR')}</td>
                    <td className="p-1.5 text-right font-mono">{totalCredit.toLocaleString('fr-FR')}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    </div>
  );
}
