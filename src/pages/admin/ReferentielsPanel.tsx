import { useCallback, useEffect, useState } from 'react';
import Papa from 'papaparse';
import { toast } from 'sonner';
import { rpcPlateforme } from '@/lib/rpc-plateforme';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { lireReferentiel, lots, type LigneCim10 } from '@/domain/sante/cim10';
import { Label } from '@/components/ui/label';

type Bilan = { recues: number; enregistrees: number; rejets: string[] };

/** Chargement de la CIM-10 (codes et libellés, aucune donnée patient). Tracé au journal. */
function ImportCim10({ onCharge }: { onCharge: () => void }) {
  const [version, setVersion] = useState('');
  const [apercu, setApercu] = useState<{ lignes: LigneCim10[]; ignorees: number; fichier: string } | null>(null);
  const [progression, setProgression] = useState<{ fait: number; total: number } | null>(null);
  const [bilan, setBilan] = useState<{ enregistrees: number; rejets: string[] } | null>(null);

  async function lire(f: File) {
    setBilan(null);
    // Les fichiers ATIH sont souvent en Latin-1 : on tente l'UTF-8, puis Windows-1252 si des caractères sont illisibles.
    const brut = new Uint8Array(await f.arrayBuffer());
    let texte = new TextDecoder('utf-8').decode(brut);
    if (texte.includes('\uFFFD')) texte = new TextDecoder('windows-1252').decode(brut);
    const p = Papa.parse<string[]>(texte.replace(/^\uFEFF/, ''), { skipEmptyLines: 'greedy' });
    const r = lireReferentiel(p.data);
    if (r.lignes.length === 0) return toast.error('Aucun code CIM-10 reconnu dans ce fichier.');
    setApercu({ ...r, fichier: f.name });
  }

  async function envoyer() {
    if (!apercu || version.trim().length < 2) return;
    const paquets = lots(apercu.lignes, 2000);
    let enregistrees = 0; const rejets: string[] = [];
    setProgression({ fait: 0, total: paquets.length });
    for (const [i, p] of paquets.entries()) {
      const { data, error } = await rpcPlateforme<Bilan>('plateforme_cim10_importer', { _version: version.trim(), _lignes: p });
      if (error) { toast.error(`Lot ${i + 1} : ${error.message}`); break; }
      enregistrees += data?.enregistrees ?? 0; rejets.push(...(data?.rejets ?? []));
      setProgression({ fait: i + 1, total: paquets.length });
    }
    setBilan({ enregistrees, rejets }); setProgression(null); onCharge();
  }

  return (
      <div className="border border-border rounded-md p-4 space-y-3">
        <p className="text-sm font-semibold">Charger une nouvelle version</p>
        <label className="text-xs block">Fichier CSV ou TXT (colonnes « code » et « libellé », ou code puis libellés)
          <Input type="file" accept=".csv,.txt,.tsv" onChange={e => { const f = e.target.files?.[0]; if (f) void lire(f); }} />
        </label>
        <label className="text-xs block">Version du référentiel<Input value={version} onChange={e => setVersion(e.target.value)} placeholder="Ex. CIM-10 FR 2025 (ATIH)" className="w-80" /></label>
        {apercu && (
          <div className="text-sm space-y-2">
            <p><b>{apercu.lignes.length.toLocaleString('fr-FR')}</b> codes lus dans {apercu.fichier}{apercu.ignorees ? ` · ${apercu.ignorees.toLocaleString('fr-FR')} lignes ignorées (blocs, en-têtes, lignes vides)` : ''}.</p>
            <table className="text-xs w-full"><tbody>{apercu.lignes.slice(0, 8).map(l => <tr key={l.code} className="border-t border-border"><td className="font-mono py-1 pr-3">{l.code}</td><td>{l.libelle}</td></tr>)}</tbody></table>
            <Button disabled={!!progression || version.trim().length < 2} onClick={envoyer}>{progression ? `Envoi ${progression.fait}/${progression.total}…` : 'Charger le référentiel'}</Button>
          </div>
        )}
        {bilan && <p className="text-sm" role="status">{bilan.enregistrees.toLocaleString('fr-FR')} codes enregistrés.{bilan.rejets.length ? ` Rejetés : ${bilan.rejets.slice(0, 10).join(', ')}${bilan.rejets.length > 10 ? '…' : ''}` : ''}</p>}
      </div>
  );
}

type Etat = {
  cim10: { version: string; codes: number; mis_a_jour: string }[];
  cim10_codes_structures: { codes: number; structures: number } | null;
  plan: { version: string; source: string; valide: boolean; visa_le: string | null; visa_expert: string | null; comptes_referentiel: number } | null;
  comptes_communs: { numero: string; intitule: string; sens: string; actif: boolean; dossiers: number }[];
  dossiers: { entreprise_id: string; nom: string; comptes: number; propres: number; manquants: number; exemples_propres: string[] }[];
};
const date = (d: string | null) => (d ? new Date(d).toLocaleDateString('fr-FR') : '—');
const nb = (n: number) => Number(n).toLocaleString('fr-FR');

/** Référentiels gérés par la plateforme : CIM-10 et plan comptable SYSCOHADA (comptes communs), comptes propres des dossiers. */
export default function ReferentielsPanel() {
  const [etat, setEtat] = useState<Etat | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const charger = useCallback(async () => {
    const { data, error } = await rpcPlateforme<Etat>('plateforme_referentiels_etat');
    if (error) setErreur(error.message); else { setErreur(null); setEtat(data); }
  }, []);
  useEffect(() => { void charger(); }, [charger]);

  return (
    <section className="space-y-6 max-w-4xl">
      <div>
        <h1 className="font-serif text-2xl">Référentiels</h1>
        <p className="text-sm text-muted-foreground">Gérés par la plateforme et communs à toutes les structures. Chaque structure peut y ajouter ses propres éléments, qui restent dans son espace. Chaque modification est inscrite au journal.</p>
      </div>
      {erreur && <p className="text-sm text-destructive">{erreur}</p>}

      <div className="space-y-3">
        <h2 className="font-semibold">CIM-10</h2>
        {etat && <div className="border border-border rounded-md p-4 text-sm space-y-1">
          {etat.cim10.length === 0 ? <p className="text-muted-foreground">Aucun référentiel chargé.</p>
            : etat.cim10.map(v => <p key={v.version}><b>{v.version}</b> · {nb(v.codes)} codes · mis à jour le {date(v.mis_a_jour)}</p>)}
          <p className="text-muted-foreground">Codes ajoutés par les structures : {nb(etat.cim10_codes_structures?.codes ?? 0)} code(s) dans {nb(etat.cim10_codes_structures?.structures ?? 0)} structure(s), visibles de chacune seulement.</p>
        </div>}
        <ImportCim10 onCharge={charger} />
      </div>

      <PlanComptable etat={etat} onChange={charger} />
    </section>
  );
}

function PlanComptable({ etat, onChange }: { etat: Etat | null; onChange: () => void }) {
  const [numero, setNumero] = useState('');
  const [intitule, setIntitule] = useState('');
  const [sens, setSens] = useState('C');
  const [busy, setBusy] = useState(false);
  const definir = async (n: string, i: string, s: string, actif: boolean) => {
    setBusy(true);
    const { data, error } = await rpcPlateforme<{ numero: string; dossiers_completes: number }>('plateforme_compte_commun_definir', { _numero: n, _intitule: i, _sens: s, _actif: actif });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(actif ? `Compte ${data?.numero} enregistré ; ajouté à ${nb(data?.dossiers_completes ?? 0)} dossier(s)` : `Compte ${data?.numero} désactivé pour les nouveaux dossiers`);
    setNumero(''); setIntitule(''); onChange();
  };
  if (!etat) return null;
  const p = etat.plan;
  return (
    <div className="space-y-3">
      <h2 className="font-semibold">Plan comptable SYSCOHADA</h2>
      <div className="border border-border rounded-md p-4 text-sm space-y-1">
        {p ? <>
          <p><b>{p.version}</b> · {nb(p.comptes_referentiel)} comptes installables (niveaux 3 et plus, classes 1 à 8) · source {p.source}</p>
          <p className={p.valide ? 'text-muted-foreground' : 'text-destructive'}>{p.valide ? `Visé le ${date(p.visa_le)}${p.visa_expert ? ` par ${p.visa_expert}` : ' (expert-comptable à renseigner)'}` : 'Non visé : la clôture des exercices reste bloquée.'}</p>
          <p className="text-muted-foreground">Le référentiel est un texte normatif : il n'est pas modifiable ici. Une nouvelle version s'installe avec le visa de l'expert-comptable.</p>
        </> : <p className="text-muted-foreground">Référentiel introuvable.</p>}
      </div>

      <div className="border border-border rounded-md p-4 space-y-3">
        <p className="text-sm font-semibold">Comptes communs de la plateforme</p>
        <p className="text-xs text-muted-foreground">Subdivisions d'un compte SYSCOHADA utilisées par l'application (ex. 70611 pour les consultations). Un compte actif est ajouté à tous les dossiers qui ne l'ont pas ; il n'est jamais modifié ni supprimé dans un dossier existant.</p>
        <table className="w-full text-sm"><tbody>
          {etat.comptes_communs.map(c => <tr key={c.numero} className={`border-t border-border ${c.actif ? '' : 'opacity-60'}`}>
            <td className="py-1.5 pr-3 font-mono text-xs">{c.numero}</td><td>{c.intitule}</td><td className="text-xs text-muted-foreground">{c.sens} · {nb(c.dossiers)} dossier(s)</td>
            <td className="text-right"><Button size="sm" variant="ghost" className="h-7 text-xs" disabled={busy} onClick={() => definir(c.numero, c.intitule, c.sens, !c.actif)}>{c.actif ? 'Désactiver' : 'Réactiver'}</Button></td>
          </tr>)}
        </tbody></table>
        <div className="grid sm:grid-cols-[8rem_1fr_6rem_auto] gap-2 items-end">
          <div><Label className="text-xs">Numéro</Label><Input value={numero} onChange={e => setNumero(e.target.value)} placeholder="70614" /></div>
          <div><Label className="text-xs">Intitulé</Label><Input value={intitule} onChange={e => setIntitule(e.target.value)} placeholder="Prestations de santé — hospitalisation" /></div>
          <div><Label className="text-xs">Sens</Label><select className="h-10 w-full rounded-md border border-border bg-background px-2 text-sm" value={sens} onChange={e => setSens(e.target.value)}><option>C</option><option>D</option><option>D/C</option></select></div>
          <Button disabled={busy || !numero || !intitule} onClick={() => definir(numero, intitule, sens, true)}>Ajouter</Button>
        </div>
      </div>

      <div className="border border-border rounded-md p-4 space-y-2">
        <p className="text-sm font-semibold">Plans des dossiers</p>
        <p className="text-xs text-muted-foreground">Les comptes propres sont ajoutés par chaque dossier et ne sont visibles que de lui.</p>
        <table className="w-full text-sm">
          <thead><tr className="text-xs text-muted-foreground text-left"><th className="py-1">Dossier</th><th>Comptes</th><th>Propres</th><th>Manquants</th></tr></thead>
          <tbody>{etat.dossiers.map(d => <tr key={d.entreprise_id} className="border-t border-border align-top">
            <td className="py-1.5 pr-3">{d.nom}{d.exemples_propres.length > 0 && <span className="block text-xs text-muted-foreground">{d.exemples_propres.join(' · ')}</span>}</td>
            <td>{nb(d.comptes)}</td><td>{nb(d.propres)}</td><td className={d.manquants > 0 ? 'text-warning' : ''}>{nb(d.manquants)}</td>
          </tr>)}</tbody>
        </table>
        <p className="text-xs text-muted-foreground">« Manquants » : comptes installables absents du dossier ; l'administrateur ou le comptable du dossier les ajoute depuis son plan comptable (« Installer les comptes manquants »).</p>
      </div>
    </div>
  );
}
