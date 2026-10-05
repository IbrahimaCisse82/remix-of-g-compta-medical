import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { bordereauParOrganisme, fcfa, type LigneBordereau } from '@/domain/sante/tiers-payant';
import { exportCsv } from '@/lib/csv-export';

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
      .select('numero, type, annulee, organisme, part_organisme, created_at, patient:sante_patients(nom, prenoms, numero_dossier)')
      .eq('structure_id', structureId).not('organisme', 'is', null).gte('created_at', debut).lt('created_at', fin).order('created_at')
      .then(({ data }) => setLignes((data ?? []).map(f => ({
        numero: f.numero, type: f.type, annulee: f.annulee, organisme: f.organisme, part_organisme: Number(f.part_organisme),
        date: f.created_at.slice(0, 10), patient: `${f.patient?.nom ?? ''} ${f.patient?.prenoms ?? ''}`.trim(), dossier: f.patient?.numero_dossier ?? '',
      }))));
    supabase.rpc('sante_ventes_par_categorie', { _structure_id: structureId, _debut: debut, _fin: new Date(d.getTime() - 86400000).toISOString().slice(0, 10) })
      .then(({ data }) => setCats((data ?? []) as typeof cats));
    supabase.from('sante_compta_liens').select('source_type, statut, erreur, created_at')
      .eq('structure_id', structureId).neq('statut', 'comptabilise').order('created_at', { ascending: false }).limit(20)
      .then(({ data }) => setLiens(data ?? []));
  }, [structureId, mois]);

  const groupes = bordereauParOrganisme(lignes);

  const imprimer = (g: (typeof groupes)[number]) => {
    const w = window.open('', '_blank'); if (!w) return;
    const rows = g.lignes.map(l => `<tr><td>${l.date}</td><td>${l.numero}</td><td>${l.dossier}</td><td>${l.patient}</td><td style="text-align:right">${fcfa(l.part_organisme)}</td></tr>`).join('');
    w.document.write(`<html><head><title>Bordereau ${g.organisme} ${mois}</title><style>@page{size:A4;margin:15mm}body{font-family:sans-serif;font-size:12px}table{width:100%;border-collapse:collapse}td,th{border:1px solid #999;padding:5px}</style></head><body><h2>Bordereau de facturation — ${g.organisme}</h2><p>Période : ${mois}</p><table><tr><th>Date</th><th>Facture</th><th>Dossier</th><th>Patient</th><th>Montant</th></tr>${rows}<tr><td colspan="4"><b>Total</b></td><td style="text-align:right"><b>${fcfa(g.total)}</b></td></tr></table><script>print()</script></body></html>`);
  };

  return (
    <section className="border border-border bg-bg2 rounded-md p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold">Bordereaux mensuels par organisme</h3>
        <Input type="month" value={mois} onChange={e => setMois(e.target.value)} className="w-44" aria-label="Mois" />
      </div>
      {groupes.length === 0 ? <p className="text-sm text-fg3">Aucune part organisme sur ce mois.</p> : groupes.map(g => (
        <div key={g.organisme} className="flex flex-wrap items-center justify-between gap-2 border border-border rounded-md p-3 text-sm">
          <span><b>{g.organisme}</b> · {g.lignes.length} pièce(s) · {fcfa(g.total)}</span>
          <span className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => imprimer(g)}>Imprimer A4</Button>
            <Button size="sm" variant="outline" onClick={() => exportCsv(['Date', 'Facture', 'Dossier', 'Patient', 'Montant'], g.lignes.map(l => [l.date, l.numero, l.dossier, l.patient, l.part_organisme]), `bordereau-${g.organisme}-${mois}.csv`)}>CSV</Button>
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
