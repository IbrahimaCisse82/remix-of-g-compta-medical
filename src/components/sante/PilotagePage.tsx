import { useCallback, useEffect, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';

const xof = (n: unknown) => `${Math.round(Number(n) || 0).toLocaleString('fr-FR')} FCFA`;
const v = (n: unknown, u = '') => (n === null || n === undefined ? '—' : `${n}${u}`);
const iso = (d: Date) => d.toISOString().slice(0, 10);

function Kpi({ l, val }: { l: string; val: string }) {
  return <div className="border border-border bg-bg2 rounded-md p-3"><p className="text-[11px] text-fg2 uppercase">{l}</p><p className="text-xl font-semibold">{val}</p></div>;
}
function Table({ titre, cols, rows }: { titre: string; cols: string[]; rows: (string | number)[][] }) {
  return (
    <section className="border border-border bg-bg2 rounded-md overflow-x-auto">
      <h3 className="px-3 py-2 font-semibold text-sm border-b border-border">{titre}</h3>
      <table className="w-full text-xs"><thead><tr className="text-fg2">{cols.map((c, i) => <th key={c} className={`p-2 ${i ? 'text-right' : 'text-left'}`}>{c}</th>)}</tr></thead>
        <tbody>{rows.length === 0 ? <tr><td colSpan={cols.length} className="p-3 text-center text-fg3">Aucune donnée sur la période</td></tr> : rows.map((r, i) => <tr key={i} className="border-t border-border">{r.map((c, j) => <td key={j} className={`p-2 ${j ? 'text-right' : ''}`}>{c}</td>)}</tr>)}</tbody></table>
    </section>
  );
}

export default function PilotagePage({ structureId }: { structureId: string }) {
  const now = new Date();
  const [debut, setDebut] = useState(iso(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [fin, setFin] = useState(iso(now));
  const [d, setD] = useState<any>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('sante_tableau_bord', { _structure_id: structureId, _debut: debut, _fin: fin });
    if (error) { toast.error(error.message.includes('Droit') ? 'Réservé à la direction, aux médecins, biologistes et comptables.' : error.message); return; }
    setD(data);
  }, [structureId, debut, fin]);
  useEffect(() => { void load(); }, [load]);

  const caTotal = (d?.ca_actes ?? []).reduce((s: number, r: any) => s + Number(r.montant), 0);
  const creances = (d?.tiers ?? []).reduce((s: number, r: any) => s + Number(r.creances), 0);

  return (
    <div className="max-w-6xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-2"><BarChart3 className="text-primary" /><h1 className="font-serif text-2xl">Pilotage médico-économique</h1></div>
        <div className="flex gap-2 items-center text-sm"><Input type="date" aria-label="Début" value={debut} onChange={e => setDebut(e.target.value)} /><span>→</span><Input type="date" aria-label="Fin" value={fin} onChange={e => setFin(e.target.value)} /></div>
      </div>
      {d && <>
        <h2 className="font-semibold">Direction / Clinique</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi l="Chiffre d’affaires" val={xof(caTotal)} />
          <Kpi l="Attente moyenne" val={v(d.attente_moyenne_min, ' min')} />
          <Kpi l="Rendez-vous" val={String((d.praticiens ?? []).reduce((s: number, p: any) => s + p.rdv, 0))} />
          <Kpi l="Créances assurances" val={xof(creances)} />
        </div>
        <Table titre="Activité par praticien (occupation sur 8 h/jour)" cols={['Praticien', 'Spécialité', 'RDV', 'Honorés', 'Absents', 'Occupation', 'Attente moy.']}
          rows={(d.praticiens ?? []).map((p: any) => [p.nom, p.specialite ?? '—', p.rdv, p.honores, p.absents, v(p.occupation, ' %'), v(p.attente_min, ' min')])} />
        <div className="grid md:grid-cols-2 gap-4">
          <Table titre="Chiffre d’affaires par spécialité" cols={['Spécialité', 'Montant']} rows={(d.ca_specialites ?? []).map((r: any) => [r.specialite, xof(r.montant)])} />
          <Table titre="Chiffre d’affaires par acte" cols={['Acte', 'Nombre', 'Montant']} rows={(d.ca_actes ?? []).map((r: any) => [r.libelle, r.nombre, xof(r.montant)])} />
        </div>
        <h2 className="font-semibold pt-2">Laboratoire</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Kpi l="Demandes" val={String(d.labo?.demandes ?? 0)} />
          <Kpi l="Validées" val={String(d.labo?.validees ?? 0)} />
          <Kpi l="Délai total moyen" val={v(d.labo?.tat_total_h, ' h')} />
          <Kpi l="Délai réception → validation" val={v(d.labo?.tat_analytique_h, ' h')} />
          <Kpi l="Délai urgences" val={v(d.labo?.tat_urgent_h, ' h')} />
        </div>
        <Table titre="Volume par technicien" cols={['Technicien', 'Résultats saisis', 'Demandes']} rows={(d.techniciens ?? []).map((t: any) => [t.nom, t.resultats, t.demandes])} />
        <h2 className="font-semibold pt-2">Tiers-payant (IPM / assurances)</h2>
        <Table titre="Recouvrement par organisme" cols={['Organisme', 'Factures', 'Part organisme', 'Payé', 'Créances', 'Rejets', 'Taux de rejet', 'Délai avant envoi', 'Délai de règlement']}
          rows={(d.tiers ?? []).map((t: any) => [t.organisme ?? '—', t.factures, xof(t.montant), xof(t.paye), xof(t.creances), t.rejets, v(t.taux_rejet, ' %'), v(t.delai_envoi_jours, ' j'), v(t.delai_jours, ' j')])} />
      </>}
    </div>
  );
}
