import { useCallback, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const VALID_MAIL = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;

/** Paramétrage : praticiens, actes facturables, catalogue d'analyses. Écriture réservée aux administrateurs (contrôlé par la base). */
export default function CataloguePage({ structureId }: { structureId: string }) {
  const [praticiens, setPraticiens] = useState<any[]>([]);
  const [actes, setActes] = useState<any[]>([]);
  const [analyses, setAnalyses] = useState<any[]>([]);
  const [pr, setPr] = useState({ nom: '', specialite: '', numero_ordre: '', email: '' });
  const [ac, setAc] = useState({ code: '', libelle: '', tarif: '' });

  const load = useCallback(async () => {
    const [a, b, c] = await Promise.all([
      supabase.from('sante_praticiens').select('*').eq('structure_id', structureId).order('nom'),
      supabase.from('sante_actes').select('*').eq('structure_id', structureId).order('code'),
      supabase.from('sante_analyses').select('id, code, libelle, section, tarif, delai_heures, actif').eq('structure_id', structureId).order('section'),
    ]);
    setPraticiens(a.data ?? []); setActes(b.data ?? []); setAnalyses(c.data ?? []);
  }, [structureId]);
  useEffect(() => { void load(); }, [load]);

  const ok = (error: { message: string } | null, msg: string) => { if (error) { toast.error(error.message.includes('row-level') ? 'Réservé à l’administrateur de la structure' : error.message); return false; } toast.success(msg); void load(); return true; };
  const addPr = async (e: React.FormEvent) => { e.preventDefault(); const m = pr.email.trim().toLowerCase(); if (m && !VALID_MAIL.test(m)) return toast.error('Adresse e-mail invalide'); if (ok((await supabase.from('sante_praticiens').insert({ structure_id: structureId, nom: pr.nom, specialite: pr.specialite, numero_ordre: pr.numero_ordre, email: m || null })).error, 'Praticien ajouté')) setPr({ nom: '', specialite: '', numero_ordre: '', email: '' }); };
  const addAc = async (e: React.FormEvent) => { e.preventDefault(); const t = Number(ac.tarif); if (!(t >= 0)) return toast.error('Tarif invalide'); if (ok((await supabase.from('sante_actes').insert({ structure_id: structureId, code: ac.code.trim().toUpperCase(), libelle: ac.libelle, tarif: t })).error, 'Acte ajouté')) setAc({ code: '', libelle: '', tarif: '' }); };
  const toggle = async (table: 'sante_praticiens' | 'sante_actes' | 'sante_analyses', id: string, actif: boolean) => ok((await supabase.from(table).update({ actif: !actif }).eq('id', id)).error, actif ? 'Désactivé' : 'Réactivé');
  const tarif = async (table: 'sante_actes' | 'sante_analyses', id: string, v: string) => { const t = Number(v); if (t >= 0) ok((await supabase.from(table).update({ tarif: t }).eq('id', id)).error, 'Tarif mis à jour'); };
  const mail = async (id: string, v: string) => { const m = v.trim().toLowerCase(); if (m && !VALID_MAIL.test(m)) return toast.error('Adresse e-mail invalide'); ok((await supabase.from('sante_praticiens').update({ email: m || null }).eq('id', id)).error, 'E-mail enregistré'); };

  const Ligne = ({ children, actif, onToggle }: { children: React.ReactNode; actif: boolean; onToggle: () => void }) => (
    <div className={`flex items-center justify-between gap-2 border border-border rounded p-2 text-sm ${actif ? '' : 'opacity-50'}`}>{children}<Button size="sm" variant="ghost" onClick={onToggle}>{actif ? 'Désactiver' : 'Activer'}</Button></div>
  );

  return (
    <div className="max-w-6xl space-y-8">
      <div><p className="text-xs font-mono uppercase text-primary mb-1">Paramétrage</p><h1 className="font-serif text-3xl">Praticiens, actes et analyses</h1><p className="text-sm text-fg2">Les tarifs sont propres à votre structure : aucun prix n’est imposé par le logiciel.</p></div>
      <div className="grid lg:grid-cols-2 gap-6">
        <section className="border border-border bg-bg2 rounded-md p-4 space-y-2">
          <h2 className="font-semibold">Praticiens</h2>
          <form onSubmit={addPr} className="grid grid-cols-2 gap-2"><Input required aria-label="Nom" placeholder="Dr Nom" value={pr.nom} onChange={e => setPr({ ...pr, nom: e.target.value })} /><Input aria-label="Spécialité" placeholder="Spécialité" value={pr.specialite} onChange={e => setPr({ ...pr, specialite: e.target.value })} /><Input aria-label="N° ordre" placeholder="N° ordre" value={pr.numero_ordre} onChange={e => setPr({ ...pr, numero_ordre: e.target.value })} /><Input aria-label="E-mail du praticien" type="email" placeholder="E-mail (notifications)" value={pr.email} onChange={e => setPr({ ...pr, email: e.target.value })} /><Button size="sm" className="col-span-2" aria-label="Ajouter le praticien"><Plus /> Ajouter le praticien</Button></form>
          {praticiens.map(p => <Ligne key={p.id} actif={p.actif} onToggle={() => toggle('sante_praticiens', p.id, p.actif)}><span className="flex-1 min-w-0"><strong>{p.nom}</strong> <span className="text-fg3">{p.specialite} · {p.numero_ordre}</span><Input aria-label={`E-mail de ${p.nom}`} className="h-8 mt-1" placeholder="E-mail (notifications)" defaultValue={p.email ?? ''} onBlur={e => e.target.value !== (p.email ?? '') && mail(p.id, e.target.value)} /></span></Ligne>)}
        </section>
        <section className="border border-border bg-bg2 rounded-md p-4 space-y-2">
          <h2 className="font-semibold">Actes facturables</h2>
          <form onSubmit={addAc} className="grid grid-cols-[1fr_3fr_1fr_auto] gap-2"><Input required aria-label="Code" placeholder="Code" value={ac.code} onChange={e => setAc({ ...ac, code: e.target.value })} /><Input required aria-label="Libellé" placeholder="Libellé" value={ac.libelle} onChange={e => setAc({ ...ac, libelle: e.target.value })} /><Input required aria-label="Tarif" inputMode="numeric" placeholder="FCFA" value={ac.tarif} onChange={e => setAc({ ...ac, tarif: e.target.value })} /><Button size="icon" aria-label="Ajouter"><Plus /></Button></form>
          {actes.map(a => <Ligne key={a.id} actif={a.actif} onToggle={() => toggle('sante_actes', a.id, a.actif)}><span className="flex-1"><span className="font-mono text-xs text-primary">{a.code}</span> {a.libelle}</span><Input aria-label={`Tarif ${a.code}`} className="w-28 h-8" defaultValue={a.tarif} onBlur={e => e.target.value !== String(a.tarif) && tarif('sante_actes', a.id, e.target.value)} /></Ligne>)}
        </section>
      </div>
      <section className="border border-border bg-bg2 rounded-md p-4 space-y-2">
        <h2 className="font-semibold">Catalogue d’analyses</h2>
        {analyses.length === 0 && <p className="text-xs text-fg3">Aucune analyse.</p>}
        {analyses.map(a => <Ligne key={a.id} actif={a.actif} onToggle={() => toggle('sante_analyses', a.id, a.actif)}><span className="flex-1"><span className="font-mono text-xs text-primary">{a.code}</span> {a.libelle} <span className="text-xs text-fg3">· {a.section} · rendu {a.delai_heures} h</span></span><Input aria-label={`Tarif ${a.code}`} className="w-28 h-8" defaultValue={a.tarif} onBlur={e => e.target.value !== String(a.tarif) && tarif('sante_analyses', a.id, e.target.value)} /></Ligne>)}
      </section>
    </div>
  );
}
