import { useState } from 'react';
import Papa from 'papaparse';
import { toast } from 'sonner';
import { rpcPlateforme } from '@/lib/rpc-plateforme';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { lireReferentiel, lots, type LigneCim10 } from '@/domain/sante/cim10';

type Bilan = { recues: number; enregistrees: number; rejets: string[] };

/** Référentiels communs : chargement de la CIM-10 (codes et libellés, aucune donnée patient). Tracé au journal. */
export default function ReferentielsPanel() {
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
    setBilan({ enregistrees, rejets }); setProgression(null);
  }

  return (
    <section className="space-y-4 max-w-3xl">
      <div>
        <h1 className="font-serif text-2xl">Référentiels</h1>
        <p className="text-sm text-muted-foreground">CIM-10 utilisée par les médecins pour coder les diagnostics et les maladies chroniques. Un nouveau chargement met à jour les libellés sans supprimer de code. Chaque chargement est inscrit au journal.</p>
      </div>
      <div className="border border-border rounded-md p-4 space-y-3">
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
    </section>
  );
}
