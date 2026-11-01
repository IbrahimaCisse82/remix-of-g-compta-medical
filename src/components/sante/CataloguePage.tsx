import { useCallback, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import LabotestCatalogue from './LabotestCatalogue';
import AnalyseDetail from './AnalyseDetail';
import CatalogueTableur from './CatalogueTableur';
import { ImportActes } from './ImportsStructure';
import { aValider, avancementCatalogue, compterParametres, filtrerCatalogue, type FiltreCatalogue } from '@/domain/sante/catalogue-suivi';

const VALID_MAIL = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;

/** Paramétrage : praticiens, actes facturables, catalogue d'analyses. Écriture réservée aux administrateurs (contrôlé par la base). */
export default function CataloguePage({ structureId }: { structureId: string }) {
  const [praticiens, setPraticiens] = useState<any[]>([]);
  const [actes, setActes] = useState<any[]>([]);
  const [analyses, setAnalyses] = useState<any[]>([]);
  const [pr, setPr] = useState({ nom: '', specialite: '', numero_ordre: '', email: '', moi: false });
  const [an, setAn] = useState({ code: '', libelle: '', section: 'biochimie', tube: '', echantillon: 'Sang veineux', delai: '24', tarif: '', param: '', unite: '', type: 'numerique' });
  const [derog, setDerog] = useState(false);
  const [ac, setAc] = useState({ code: '', libelle: '', tarif: '' });
  const [analyseBusy, setAnalyseBusy] = useState(false);
  const [vue, setVue] = useState('structure');
  const [nbParams, setNbParams] = useState<Record<string, number>>({});
  const [fiche, setFiche] = useState<string | null>(null);
  const [suivi, setSuivi] = useState<{ filtre: FiltreCatalogue; section: string; q: string }>({ filtre: 'toutes', section: '', q: '' });

  const load = useCallback(async () => {
    const [a, b, c, n] = await Promise.all([
      supabase.from('sante_praticiens').select('*').eq('structure_id', structureId).order('nom'),
      supabase.from('sante_actes').select('*').eq('structure_id', structureId).order('code'),
      supabase.from('sante_analyses').select('id, code, libelle, section, tarif, delai_heures, actif').eq('structure_id', structureId).order('section').order('code'),
      supabase.from('sante_analyse_parametres').select('analyse_id').eq('structure_id', structureId),
    ]);
    setNbParams(compterParametres(n.data ?? []));
    const st = await supabase.from('structures').select('derogation_validation_unique').eq('id', structureId).maybeSingle(); setDerog(!!st.data?.derogation_validation_unique);
    setPraticiens(a.data ?? []); setActes(b.data ?? []); setAnalyses(c.data ?? []);
  }, [structureId]);
  useEffect(() => { void load(); }, [load]);

  const ok = (error: { message: string } | null, msg: string) => { if (error) { toast.error(error.message.includes('row-level') ? 'Réservé à l’administrateur de la structure' : error.message); return false; } toast.success(msg); void load(); return true; };
  const addPr = async (e: React.FormEvent) => { e.preventDefault(); const m = pr.email.trim().toLowerCase(); if (m && !VALID_MAIL.test(m)) return toast.error('Adresse e-mail invalide');
    const uid = pr.moi ? (await supabase.auth.getUser()).data.user?.id ?? null : null;
    if (ok((await supabase.from('sante_praticiens').insert({ structure_id: structureId, nom: pr.nom, specialite: pr.specialite, numero_ordre: pr.numero_ordre, email: m || null, user_id: uid })).error, 'Praticien ajouté')) setPr({ nom: '', specialite: '', numero_ordre: '', email: '', moi: false }); };
  // Fonction serveur : un médecin ou un biologiste non administrateur peut relier sa propre fiche (la mise à jour directe lui est interdite).
  const lierMoi = async (id: string) => { if (ok((await supabase.rpc('sante_praticien_relier_moi', { _praticien_id: id })).error, 'Fiche reliée à votre compte')) await load(); };
  const addAn = async (e: React.FormEvent) => {
    e.preventDefault(); if (analyseBusy) return;
    const t = Number(an.tarif), d = Number(an.delai);
    if (!Number.isSafeInteger(t) || t < 0) return toast.error('Tarif FCFA entier positif ou nul obligatoire');
    if (!Number.isSafeInteger(d) || d <= 0) return toast.error('Délai positif obligatoire');
    if (!an.param.trim()) return toast.error('Indiquez au moins un paramètre mesuré');
    setAnalyseBusy(true);
    try {
      const r = await supabase.rpc('sante_catalogue_creer_analyse', { _structure_id: structureId, _code: an.code, _libelle: an.libelle, _section: an.section, _tarif: t, _delai: d, _tube: an.tube, _echantillon: an.echantillon, _parametre: an.param, _unite: an.unite, _type: an.type });
      if (!ok(r.error, 'Analyse et paramètre ajoutés')) return;
      setAn({ ...an, code: '', libelle: '', tarif: '', param: '', unite: '' });
    } finally { setAnalyseBusy(false); }
  };
  const addAc = async (e: React.FormEvent) => { e.preventDefault(); const t = Number(ac.tarif); if (!(t >= 0)) return toast.error('Tarif invalide'); if (ok((await supabase.from('sante_actes').insert({ structure_id: structureId, code: ac.code.trim().toUpperCase(), libelle: ac.libelle, tarif: t })).error, 'Acte ajouté')) setAc({ code: '', libelle: '', tarif: '' }); };
  const toggle = async (table: 'sante_praticiens' | 'sante_actes' | 'sante_analyses', id: string, actif: boolean) => ok((await supabase.from(table).update({ actif: !actif }).eq('id', id)).error, actif ? 'Désactivé' : 'Réactivé');
  const tarif = async (table: 'sante_actes' | 'sante_analyses', id: string, v: string) => { const t = Number(v); if (t >= 0) ok((await supabase.from(table).update({ tarif: t }).eq('id', id)).error, 'Tarif mis à jour'); };
  const mail = async (id: string, v: string) => { const m = v.trim().toLowerCase(); if (m && !VALID_MAIL.test(m)) return toast.error('Adresse e-mail invalide'); ok((await supabase.from('sante_praticiens').update({ email: m || null }).eq('id', id)).error, 'E-mail enregistré'); };

  const avecParams = analyses.map(a => ({ ...a, nb_parametres: nbParams[a.id] ?? 0 }));
  const avancement = avancementCatalogue(avecParams);
  const sections = [...new Set(analyses.map(a => a.section as string))].sort();
  const visibles = filtrerCatalogue(avecParams, suivi);

  const Ligne = ({ children, actif, onToggle }: { children: React.ReactNode; actif: boolean; onToggle: () => void }) => (
    <div className={`flex items-center justify-between gap-2 border border-border rounded p-2 text-sm ${actif ? '' : 'opacity-50'}`}>{children}<Button size="sm" variant="ghost" onClick={onToggle}>{actif ? 'Désactiver' : 'Activer'}</Button></div>
  );

  return (
    <div className="max-w-6xl space-y-8">
      <div><p className="text-xs font-mono uppercase text-primary mb-1">Paramétrage</p><h1 className="font-serif text-3xl">Praticiens, actes et analyses</h1><p className="text-sm text-fg2">Les tarifs sont propres à votre structure : aucun prix n’est imposé par le logiciel.</p></div>
      <Tabs value={vue} onValueChange={setVue}><TabsList><TabsTrigger value="structure">Catalogue de la structure</TabsTrigger><TabsTrigger value="labotest">Labotest · démo</TabsTrigger></TabsList></Tabs>
      {vue === 'labotest' ? <LabotestCatalogue /> : <>
      <section className="border border-border bg-bg2 rounded-md p-4">
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={derog} onChange={async e => { const v = e.target.checked; if (ok((await supabase.from('structures').update({ derogation_validation_unique: v } as any).eq('id', structureId)).error, v ? 'Biologiste seul autorisé' : 'Double validation rétablie')) setDerog(v); }} />
          <span><strong>Laboratoire avec un seul biologiste</strong><br /><span className="text-fg3">Autorise le biologiste à saisir et valider seul (technique puis biologique). Chaque utilisation est tracée. Laissez décoché si une autre personne peut faire la validation technique.</span></span></label>
      </section>
      <div className="grid lg:grid-cols-2 gap-6">
        <section className="border border-border bg-bg2 rounded-md p-4 space-y-2">
          <h2 className="font-semibold">Praticiens</h2>
          <form onSubmit={addPr} className="grid grid-cols-2 gap-2"><Input required aria-label="Nom" placeholder="Dr Nom" value={pr.nom} onChange={e => setPr({ ...pr, nom: e.target.value })} /><Input aria-label="Spécialité" placeholder="Spécialité" value={pr.specialite} onChange={e => setPr({ ...pr, specialite: e.target.value })} /><Input aria-label="N° ordre" placeholder="N° ordre" value={pr.numero_ordre} onChange={e => setPr({ ...pr, numero_ordre: e.target.value })} /><Input aria-label="E-mail du praticien" type="email" placeholder="E-mail (notifications)" value={pr.email} onChange={e => setPr({ ...pr, email: e.target.value })} /><label className="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={pr.moi} onChange={e => setPr({ ...pr, moi: e.target.checked })} /> C’est ma fiche (nécessaire pour signer les ordonnances et valider les résultats)</label><Button size="sm" className="col-span-2" aria-label="Ajouter le praticien"><Plus /> Ajouter le praticien</Button></form>
          {praticiens.map(p => <Ligne key={p.id} actif={p.actif} onToggle={() => toggle('sante_praticiens', p.id, p.actif)}><span className="flex-1 min-w-0"><strong>{p.nom}</strong> <span className="text-fg3">{p.specialite} · {p.numero_ordre}</span> {p.user_id ? <span className="text-xs text-primary">· compte relié</span> : <button type="button" className="text-xs underline text-primary" onClick={() => lierMoi(p.id)}>C’est moi</button>}<Input aria-label={`E-mail de ${p.nom}`} className="h-8 mt-1" placeholder="E-mail (notifications)" defaultValue={p.email ?? ''} onBlur={e => e.target.value !== (p.email ?? '') && mail(p.id, e.target.value)} /></span></Ligne>)}
        </section>
        <section className="border border-border bg-bg2 rounded-md p-4 space-y-2">
          <h2 className="font-semibold">Actes facturables</h2>
          <ImportActes structureId={structureId} onDone={() => void load()} />
          <form onSubmit={addAc} className="grid grid-cols-[1fr_3fr_1fr_auto] gap-2"><Input required aria-label="Code" placeholder="Code" value={ac.code} onChange={e => setAc({ ...ac, code: e.target.value })} /><Input required aria-label="Libellé" placeholder="Libellé" value={ac.libelle} onChange={e => setAc({ ...ac, libelle: e.target.value })} /><Input required aria-label="Tarif" inputMode="numeric" placeholder="FCFA" value={ac.tarif} onChange={e => setAc({ ...ac, tarif: e.target.value })} /><Button size="icon" aria-label="Ajouter"><Plus /></Button></form>
          {actes.map(a => <Ligne key={a.id} actif={a.actif} onToggle={() => toggle('sante_actes', a.id, a.actif)}><span className="flex-1"><span className="font-mono text-xs text-primary">{a.code}</span> {a.libelle}</span><Input aria-label={`Tarif ${a.code}`} className="w-28 h-8" defaultValue={a.tarif} onBlur={e => e.target.value !== String(a.tarif) && tarif('sante_actes', a.id, e.target.value)} /></Ligne>)}
        </section>
      </div>
      <section className="border border-border bg-bg2 rounded-md p-4 space-y-2">
        <h2 className="font-semibold">Catalogue d’analyses</h2>
        <form onSubmit={addAn} className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <Input required aria-label="Code analyse" placeholder="Code (ex. GLY)" value={an.code} onChange={e => setAn({ ...an, code: e.target.value })} />
          <Input required aria-label="Libellé analyse" className="md:col-span-2" placeholder="Libellé (ex. Glycémie à jeun)" value={an.libelle} onChange={e => setAn({ ...an, libelle: e.target.value })} />
          <select aria-label="Section" className="h-10 rounded-md border border-border bg-background px-2 text-sm" value={an.section} onChange={e => setAn({ ...an, section: e.target.value })}>{['biochimie','hematologie','serologie','bacteriologie','parasitologie','hormonologie','urines'].map(x => <option key={x} value={x}>{x}</option>)}</select>
          <Input required aria-label="Tarif analyse" inputMode="numeric" placeholder="Tarif FCFA" value={an.tarif} onChange={e => setAn({ ...an, tarif: e.target.value })} />
          <Input aria-label="Tube" placeholder="Tube" value={an.tube} onChange={e => setAn({ ...an, tube: e.target.value })} />
          <Input aria-label="Échantillon" placeholder="Échantillon" value={an.echantillon} onChange={e => setAn({ ...an, echantillon: e.target.value })} />
          <Input aria-label="Délai de rendu (heures)" inputMode="numeric" placeholder="Délai (h)" value={an.delai} onChange={e => setAn({ ...an, delai: e.target.value })} />
          <Input required aria-label="Paramètre mesuré" placeholder="Paramètre mesuré (ex. Glucose)" value={an.param} onChange={e => setAn({ ...an, param: e.target.value })} />
          <Input aria-label="Unité" placeholder="Unité (ex. g/L)" value={an.unite} onChange={e => setAn({ ...an, unite: e.target.value })} />
          <select aria-label="Type de résultat" className="h-10 rounded-md border border-border bg-background px-2 text-sm" value={an.type} onChange={e => setAn({ ...an, type: e.target.value })}><option value="numerique">Nombre</option><option value="qualitatif">Positif / négatif</option><option value="texte">Texte</option></select>
          <Button size="sm" className="md:col-span-4" aria-label="Ajouter l’analyse" disabled={analyseBusy}><Plus /> Ajouter l’analyse</Button>
        </form>
        {analyses.length === 0 ? <p className="text-xs text-fg3">Aucune analyse.</p> : <>
          <div className="border-t border-border pt-3 space-y-2">
            <p className="text-sm"><strong>Validation du catalogue :</strong> {avancement.actives} / {avancement.total} analyses prêtes à prescrire ({avancement.pourcentage} %) · <span className={avancement.a_valider ? 'text-destructive' : 'text-primary'}>{avancement.a_valider} à valider</span>{avancement.sans_parametre > 0 && <span className="text-fg3"> · {avancement.sans_parametre} sans paramètre mesuré</span>}</p>
            <div className="h-1.5 rounded-full bg-bg3 overflow-hidden" aria-hidden><div className="h-full bg-primary" style={{ width: `${avancement.pourcentage}%` }} /></div>
            <CatalogueTableur structureId={structureId} analyses={analyses} completesInactives={avecParams.filter(a => !a.actif && a.nb_parametres > 0)} onDone={() => void load()} />
            <p className="text-xs text-fg3">Ouvrez une analyse pour vérifier sa section, son tube et son délai, saisir ses paramètres mesurés et leurs valeurs de référence, puis activez-la. Une analyse sans paramètre ne peut pas être activée.</p>
            <div className="grid grid-cols-1 sm:grid-cols-[auto_auto_1fr] gap-2">
              <select aria-label="Filtrer par statut" className="h-9 rounded-md border border-border bg-background px-2 text-sm" value={suivi.filtre} onChange={e => setSuivi({ ...suivi, filtre: e.target.value as FiltreCatalogue })}><option value="toutes">Toutes ({avancement.total})</option><option value="a_valider">À valider ({avancement.a_valider})</option><option value="actives">Prêtes ({avancement.actives})</option></select>
              <select aria-label="Filtrer par section" className="h-9 rounded-md border border-border bg-background px-2 text-sm" value={suivi.section} onChange={e => setSuivi({ ...suivi, section: e.target.value })}><option value="">Toutes les sections</option>{sections.map(x => <option key={x} value={x}>{x}</option>)}</select>
              <Input aria-label="Rechercher une analyse" className="h-9" placeholder="Rechercher par code ou libellé" value={suivi.q} onChange={e => setSuivi({ ...suivi, q: e.target.value })} />
            </div>
          </div>
          {visibles.length === 0 && <p className="text-xs text-fg3">Aucune analyse ne correspond à ces filtres.</p>}
          {visibles.map(a => <Ligne key={a.id} actif={a.actif} onToggle={() => toggle('sante_analyses', a.id, a.actif)}><span className="flex-1 min-w-0"><span className="font-mono text-xs text-primary">{a.code}</span> {a.libelle} <span className="text-xs text-fg3">· {a.section} · rendu {a.delai_heures} h · {a.nb_parametres} paramètre{a.nb_parametres > 1 ? 's' : ''}</span>{aValider(a) && <span className="ml-2 text-xs text-destructive">à valider</span>}</span><Button size="sm" variant="outline" onClick={() => setFiche(a.id)}>Fiche</Button><Input aria-label={`Tarif ${a.code}`} className="w-28 h-8" defaultValue={a.tarif} onBlur={e => e.target.value !== String(a.tarif) && tarif('sante_analyses', a.id, e.target.value)} /></Ligne>)}
        </>}
      </section>
      <AnalyseDetail structureId={structureId} analyseId={fiche} onClose={() => setFiche(null)} onSaved={() => void load()} />
      </>}
    </div>
  );
}
