import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { bordereauParOrganisme, fcfa, type LigneBordereau } from '@/domain/sante/tiers-payant';
import { exportCsv } from '@/lib/csv-export';
import { htmlBordereau, dateFr, type StructureEntete } from '@/domain/sante/bordereau';

type Lien = { source_type: string; statut: string; erreur: string | null; created_at: string };

export default function BordereauCompta({ structureId }: { structureId: string }) {
  const [mois, setMois] = useState(new Date().toISOString().slice(0, 7));
  const [lignes, setLignes] = useState<LigneBordereau[]>([]);
  const [liens, setLiens] = useState<Lien[]>([]);
  const [cats, setCats] = useState<{ categorie: string; nb_lignes: number; montant: number }[]>([]);

  useEffect(() => {
    const debut = `${mois}-01`;
    const d = new Date(debut); d.setMonth(d.getMonth() + 1);
    const fin = d.toISOString().slice(0, 10);
    supabase.from('sante_factures')
      .select('id, numero, type, annulee, organisme, part_organisme, total, taux_couverture, facture_origine_id, patient_id, created_at, bon_id, patient:sante_patients(nom, prenoms, numero_dossier)')
      .eq('structure_id', structureId).not('organisme', 'is', null).gte('created_at', debut).lt('created_at', fin).order('created_at')
      .then(({ data }) => setLignes((data ?? []).map((f: any) => ({
        id: f.id, origine_id: f.facture_origine_id, patient_id: f.patient_id,
        numero: f.numero, type: f.type, annulee: f.annulee, organisme: f.organisme, part_organisme: Number(f.part_organisme),
        total: Number(f.total), taux: f.taux_couverture == null ? null : Number(f.taux_couverture), bon_id: f.bon_id,
        date: f.created_at.slice(0, 10), patient: `${f.patient?.nom ?? ''} ${f.patient?.prenoms ?? ''}`.trim(), dossier: f.patient?.numero_dossier ?? '',
      }))));
    supabase.rpc('sante_ventes_par_categorie', { _structure_id: structureId, _debut: debut, _fin: new Date(d.getTime() - 86400000).toISOString().slice(0, 10) })
      .then(({ data }) => setCats((data ?? []) as typeof cats));
    supabase.from('sante_compta_liens').select('source_type, statut, erreur, created_at')
      .eq('structure_id', structureId).neq('statut', 'comptabilise').order('created_at', { ascending: false }).limit(20)
      .then(({ data }) => setLiens(data ?? []));
  }, [structureId, mois]);

  const groupes = bordereauParOrganisme(lignes);

  // Détails pour l'organisme : prestations (lignes de la facture d'origine pour un avoir), n° d'adhérent, en-tête.
  const completer = async (g: (typeof groupes)[number]) => {
    const ids = [...new Set(g.lignes.map(l => (l.type === 'avoir' && l.origine_id) ? l.origine_id : l.id).filter(Boolean))] as string[];
    const patients = [...new Set(g.lignes.map(l => l.patient_id).filter(Boolean))] as string[];
    const bonIds = [...new Set(g.lignes.map(l => l.bon_id).filter(Boolean))] as string[];
    const [{ data: st }, { data: lf }, { data: ass }, { data: bons }] = await Promise.all([
      supabase.from('structures').select('nom, adresse, telephone, ninea, rccm').eq('id', structureId).maybeSingle(),
      ids.length ? supabase.from('sante_facture_lignes').select('facture_id, libelle, quantite').in('facture_id', ids) : Promise.resolve({ data: [] as any[] }),
      patients.length ? supabase.from('sante_patient_assurances').select('patient_id, numero_adherent, created_at').in('patient_id', patients).eq('organisme', g.organisme).order('created_at') : Promise.resolve({ data: [] as any[] }),
      bonIds.length ? supabase.from('sante_bons_pec').select('id, numero').in('id', bonIds) : Promise.resolve({ data: [] as any[] }),
    ]);
    const numerosBons = new Map(((bons ?? []) as any[]).map(b => [b.id, b.numero]));
    const prestations = new Map<string, string[]>();
    for (const l of (lf ?? []) as any[]) prestations.set(l.facture_id, [...(prestations.get(l.facture_id) ?? []), Number(l.quantite) > 1 ? `${l.libelle} ×${Number(l.quantite)}` : l.libelle]);
    const adherents = new Map<string, string>();
    for (const a of (ass ?? []) as any[]) if (a.numero_adherent) adherents.set(a.patient_id, a.numero_adherent);
    const lignesDetail = g.lignes.map(l => ({ ...l,
      prestations: (prestations.get(((l.type === 'avoir' && l.origine_id) ? l.origine_id : l.id) ?? '') ?? []).join(', '),
      adherent: adherents.get(l.patient_id ?? '') ?? null, bon: l.bon_id ? numerosBons.get(l.bon_id) ?? null : null }));
    return { structure: (st ?? { nom: '' }) as StructureEntete, lignes: lignesDetail };
  };
  const imprimer = async (g: (typeof groupes)[number]) => {
    const w = window.open('', '_blank'); if (!w) return;
    const { structure, lignes: detail } = await completer(g);
    w.document.write(htmlBordereau(structure, g.organisme, mois, detail, g.total));
    w.document.close();
  };
  const exporter = async (g: (typeof groupes)[number]) => {
    const { lignes: detail } = await completer(g);
    exportCsv(['Date', 'Facture', 'Type', 'Dossier', 'Patient', 'N° adhérent', 'Bon de prise en charge', 'Prestations', 'Montant total', 'Taux (%)', 'Part organisme'],
      detail.map(l => [dateFr(l.date), l.numero, l.type, l.dossier, l.patient, l.adherent ?? '', l.bon ?? '', l.prestations ?? '', l.total ?? '', l.taux ?? '', l.part_organisme]),
      `bordereau-${g.organisme}-${mois}.csv`);
  };

  return (
    <section className="border border-border bg-bg2 rounded-md p-4 space-y-3">
      {cats.length > 0 && (
        <div className="border border-border rounded-md p-3 text-sm">
          <div className="font-semibold mb-1">Ventes du mois par catégorie (sans données patients)</div>
          {cats.map(c => <div key={c.categorie} className="flex justify-between"><span>{c.categorie} · {c.nb_lignes} ligne(s)</span><span>{fcfa(Number(c.montant))}</span></div>)}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold">Bordereaux mensuels par organisme</h3>
        <Input type="month" value={mois} onChange={e => setMois(e.target.value)} className="w-44" aria-label="Mois" />
      </div>
      {groupes.length === 0 ? <p className="text-sm text-fg3">Aucune part organisme sur ce mois.</p> : groupes.map(g => (
        <div key={g.organisme} className="flex flex-wrap items-center justify-between gap-2 border border-border rounded-md p-3 text-sm">
          <span><b>{g.organisme}</b> · {g.lignes.length} pièce(s) · {fcfa(g.total)}</span>
          <span className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => void imprimer(g)}>Imprimer A4</Button>
            <Button size="sm" variant="outline" onClick={() => void exporter(g)}>CSV</Button>
          </span>
        </div>
      ))}
      <div className="pt-2 border-t border-border">
        <h4 className="text-sm font-semibold mb-1">Envoi en comptabilité</h4>
        <p className="text-xs text-fg3 mb-2">Chaque facture, avoir et encaissement crée automatiquement son écriture dans le journal de l'entreprise reliée.</p>
        {liens.length === 0 ? <p className="text-xs text-fg3">Tout est comptabilisé.</p> : liens.map((l, i) => (
          <p key={i} className="text-xs text-destructive">{new Date(l.created_at).toLocaleDateString('fr-FR')} · {l.source_type} non comptabilisé : {l.erreur}</p>
        ))}
      </div>
    </section>
  );
}
