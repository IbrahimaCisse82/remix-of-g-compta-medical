import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ShieldAlert } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

export const MOTIFS_BRIS_GLACE: Record<string, string> = {
  urgence_vitale: 'Urgence vitale',
  patient_inconscient: 'Patient inconscient ou non communicant',
  continuite_soins: 'Continuité des soins (praticien absent)',
  demande_patient: 'Demande expresse du patient',
  autre: 'Autre (à justifier)',
};

/** Accès d'urgence : motif codé + justification ≥ 20 caractères, 1 h, tracé, revue sous 72 h. */
export function BrisGlaceButton({ patientId, onOpened }: { patientId: string; onOpened: () => void }) {
  const [ouvert, setOuvert] = useState(false);
  const [code, setCode] = useState('');
  const [texte, setTexte] = useState('');
  const valider = async () => {
    const { error } = await supabase.rpc('sante_bris_de_glace', { _patient_id: patientId, _motif: texte, _motif_code: code });
    if (error) { toast.error(error.message); return; }
    toast.success("Accès d'urgence ouvert pour 1 heure.");
    setOuvert(false); setCode(''); setTexte(''); onOpened();
  };
  if (!ouvert) return <Button size="sm" variant="outline" className="mt-2" onClick={() => setOuvert(true)}><ShieldAlert />Accès d'urgence</Button>;
  return (
    <div className="mt-2 space-y-2 rounded-md border border-border p-3">
      <p className="text-xs text-fg3">Accès d'une heure, tracé, signalé aux administrateurs et revu sous 72 h.</p>
      <select aria-label="Motif" className="w-full bg-bg3 border border-border rounded-md px-2 py-1.5 text-sm" value={code} onChange={e => setCode(e.target.value)}>
        <option value="">— Motif —</option>
        {Object.entries(MOTIFS_BRIS_GLACE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
      <Textarea placeholder="Justification (20 caractères minimum)" value={texte} onChange={e => setTexte(e.target.value)} />
      <div className="flex gap-2">
        <Button size="sm" disabled={!code || texte.trim().length < 20} onClick={valider}>Ouvrir l'accès</Button>
        <Button size="sm" variant="ghost" onClick={() => setOuvert(false)}>Annuler</Button>
      </div>
    </div>
  );
}

type Acces = { id: string; motif: string; motif_code: string | null; created_at: string; expire_le: string; revu_le: string | null; commentaire_revue: string | null; escalade_le: string | null; user_id: string; patient: { numero_dossier: string } | null };
type Acte = { code: string; libelle: string };

function csv(rows: (string | number | null)[][]) {
  return rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\n');
}
export function telecharger(nom: string, contenu: string, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob(['\ufeff' + contenu], { type }));
  const a = document.createElement('a'); a.href = url; a.download = nom; a.click(); URL.revokeObjectURL(url);
}

/** Réglages administrateur : facturation automatique, règles d'accès et revue des accès d'urgence. */
export function SecuriteFacturationCard({ structureId }: { structureId: string }) {
  const [acces, setAcces] = useState<Acces[]>([]);
  const [actes, setActes] = useState<Acte[]>([]);
  const [auto, setAuto] = useState(false);
  const [acte, setActe] = useState('');
  const [tous, setTous] = useState(false);
  const [seuil, setSeuil] = useState(3);
  const [renouv, setRenouv] = useState(2);
  const [moi, setMoi] = useState('');

  const load = async () => {
    const [b, a, s, u] = await Promise.all([
      supabase.from('sante_bris_glace').select('id, motif, motif_code, created_at, expire_le, revu_le, commentaire_revue, escalade_le, user_id, patient:sante_patients(numero_dossier)').eq('structure_id', structureId).order('created_at', { ascending: false }).limit(200),
      supabase.from('sante_actes').select('code, libelle').eq('structure_id', structureId).eq('actif', true),
      supabase.from('structures').select('facturation_auto, acte_consultation_code, acces_tous_dossiers, bris_glace_seuil_semaine, bris_glace_renouvellements_max').eq('id', structureId).maybeSingle(),
      supabase.auth.getUser(),
    ]);
    setAcces((b.data ?? []) as Acces[]); setActes(a.data ?? []);
    setAuto(Boolean(s.data?.facturation_auto)); setActe(s.data?.acte_consultation_code ?? '');
    setTous(Boolean(s.data?.acces_tous_dossiers)); setSeuil(s.data?.bris_glace_seuil_semaine ?? 3); setRenouv(s.data?.bris_glace_renouvellements_max ?? 2);
    setMoi(u.data.user?.id ?? '');
  };
  useEffect(() => { void load(); }, [structureId]);

  const enregistrer = async () => {
    const { error } = await supabase.rpc('sante_config_facturation', { _structure_id: structureId, _auto: auto, _acte_code: acte || null });
    if (error) toast.error(error.message); else toast.success('Réglage enregistré.');
  };
  const enregistrerAcces = async () => {
    const { error } = await supabase.rpc('sante_config_acces', { _structure_id: structureId, _tous: tous, _seuil: seuil, _renouv: renouv });
    if (error) toast.error(error.message); else toast.success("Règles d'accès enregistrées.");
  };
  const revoir = async (id: string) => {
    const c = window.prompt('Commentaire de revue (obligatoire) :') ?? '';
    if (!c.trim()) return;
    const { error } = await supabase.rpc('sante_revoir_bris_glace', { _id: id, _commentaire: c });
    if (error) toast.error(error.message); else void load();
  };
  const exporter = () => telecharger(`acces-urgence-${new Date().toISOString().slice(0, 10)}.csv`, csv([
    ['Date', 'Dossier', 'Utilisateur', 'Motif', 'Justification', 'Revu le', 'Commentaire revue', 'Escaladé le'],
    ...acces.map(a => [a.created_at, a.patient?.numero_dossier ?? '', a.user_id, MOTIFS_BRIS_GLACE[a.motif_code ?? ''] ?? '', a.motif, a.revu_le, a.commentaire_revue, a.escalade_le]),
  ]));
  const enRetard = (a: Acces) => !a.revu_le && Date.now() - new Date(a.created_at).getTime() > 72 * 3600_000;

  return (
    <section className="mt-8 border border-border bg-bg2 rounded-md p-4 space-y-4">
      <div className="space-y-2">
        <h3 className="font-semibold">Facturation automatique</h3>
        <p className="text-xs text-fg3">Si activée : une facture est créée à la clôture de chaque consultation (acte choisi) et à la validation de chaque demande d'analyses. La prise en charge active du patient est appliquée.</p>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={auto} onChange={e => setAuto(e.target.checked)} />Activer</label>
        <select aria-label="Acte de consultation" className="bg-bg3 border border-border rounded-md px-2 py-1.5 text-sm" value={acte} onChange={e => setActe(e.target.value)}>
          <option value="">— Acte facturé à la clôture —</option>
          {actes.map(a => <option key={a.code} value={a.code}>{a.libelle}</option>)}
        </select>
        <div><Button size="sm" onClick={enregistrer}>Enregistrer</Button></div>
      </div>
      <div className="border-t border-border pt-3 space-y-2">
        <h3 className="font-semibold">Règles d'accès aux dossiers</h3>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={tous} onChange={e => setTous(e.target.checked)} />Les médecins accèdent à tous les dossiers de la structure</label>
        <p className="text-xs text-fg3">Désactivé : un médecin ne voit le contenu médical que des patients qu'il suit (rendez-vous, consultation ou prescription).</p>
        <div className="flex flex-wrap gap-3 text-sm">
          <label className="flex items-center gap-2">Alerte au-delà de <input type="number" min={1} className="w-16 bg-bg3 border border-border rounded px-2 py-1" value={seuil} onChange={e => setSeuil(Number(e.target.value))} /> accès d'urgence / semaine</label>
          <label className="flex items-center gap-2">Renouvellements max / 24 h <input type="number" min={0} className="w-16 bg-bg3 border border-border rounded px-2 py-1" value={renouv} onChange={e => setRenouv(Number(e.target.value))} /></label>
        </div>
        <Button size="sm" onClick={enregistrerAcces}>Enregistrer</Button>
      </div>
      <div className="border-t border-border pt-3">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold">Accès d'urgence aux dossiers</h3>
          <Button size="sm" variant="outline" onClick={exporter} disabled={!acces.length}>Exporter (CSV)</Button>
        </div>
        {acces.length === 0 ? <p className="text-xs text-fg3">Aucun accès d'urgence.</p> : acces.map(a => (
          <div key={a.id} className="flex flex-wrap justify-between gap-2 text-sm border border-border rounded-md p-2 mb-1">
            <span>{new Date(a.created_at).toLocaleString('fr-FR')} · dossier {a.patient?.numero_dossier ?? '—'} · {MOTIFS_BRIS_GLACE[a.motif_code ?? ''] ?? 'Motif libre'} · « {a.motif} »
              {enRetard(a) && <b className="ml-2 text-destructive">Revue en retard (&gt; 72 h)</b>}</span>
            {a.revu_le ? <span className="text-xs text-fg3">Revu le {new Date(a.revu_le).toLocaleDateString('fr-FR')} — {a.commentaire_revue}</span>
              : a.user_id === moi ? <span className="text-xs text-fg3">À revoir par un autre administrateur</span>
              : <Button size="sm" variant="outline" onClick={() => revoir(a.id)}>Revoir (ferme l'accès)</Button>}
          </div>
        ))}
      </div>
    </section>
  );
}
