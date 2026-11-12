import { useCallback, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CODE_VALIDE, normaliserCode } from '@/domain/sante/cim10';
import { activerCodeStructure, ajouterCodeStructure, lireCodesStructure, type CodeStructure } from './cim10-client';

/**
 * Codes CIM-10 propres à la structure : le référentiel officiel est géré par la plateforme ; l'administrateur
 * peut y ajouter des précisions (ex. N80.10) visibles uniquement par les médecins de sa structure.
 */
export default function CodesCim10Structure({ structureId }: { structureId: string }) {
  const [liste, setListe] = useState<CodeStructure[] | null>(null);
  const [code, setCode] = useState('');
  const [libelle, setLibelle] = useState('');
  const [busy, setBusy] = useState(false);
  const charger = useCallback(async () => setListe(await lireCodesStructure(structureId)), [structureId]);
  useEffect(() => { void charger(); }, [charger]);
  if (liste === null) return null;

  const c = normaliserCode(code);
  const formatOk = /^[A-Z][0-9]{2}\.[0-9A-Z]{1,4}$/.test(c) && CODE_VALIDE.test(c);
  const ajouter = async () => {
    if (!formatOk) return toast.error('Code attendu : une catégorie officielle suivie d’une précision (ex. N80.10).');
    if (libelle.trim().length < 3) return toast.error('Indiquez le libellé.');
    setBusy(true);
    const { error } = await ajouterCodeStructure(structureId, c, libelle.trim());
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`Code ${c} ajouté pour votre structure`);
    setCode(''); setLibelle(''); await charger();
  };
  const basculer = async (k: CodeStructure) => {
    const { error } = await activerCodeStructure(k.id, !k.actif);
    if (error) return toast.error(error.message);
    await charger();
  };

  return (
    <div className="mt-4 border-t border-border pt-3 space-y-2 text-sm">
      <p className="font-semibold">Codes propres à la structure</p>
      <p className="text-xs text-fg3">La CIM-10 officielle est mise à jour par la plateforme. Vous pouvez y ajouter des précisions pour votre structure (ex. N80.10 « Endométriose ovarienne droite ») : elles ne sont visibles que par vos médecins et suivent les mêmes règles de spécialité.</p>
      <div className="grid sm:grid-cols-[9rem_1fr_auto] gap-2 items-start">
        <div>
          <Input aria-label="Code" placeholder="N80.10" value={code} onChange={e => setCode(e.target.value)} maxLength={10} />
          {code && <p className={`text-xs mt-1 ${formatOk ? 'text-fg3' : 'text-warning'}`}>{formatOk ? `Sous ${c.slice(0, 3)}` : 'Format : N80.10'}</p>}
        </div>
        <Input aria-label="Libellé" placeholder="Libellé" value={libelle} onChange={e => setLibelle(e.target.value)} maxLength={300} />
        <Button disabled={busy || !code || !libelle} onClick={ajouter}><Plus />Ajouter</Button>
      </div>
      {liste.length > 0 && <ul className="divide-y divide-border">{liste.map(k => (
        <li key={k.id} className={`py-1.5 flex items-center gap-2 ${k.actif ? '' : 'opacity-60'}`}>
          <span className="font-mono text-xs text-primary w-20">{k.code}</span>
          <span className="flex-1">{k.libelle}</span>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => basculer(k)}>{k.actif ? 'Désactiver' : 'Réactiver'}</Button>
        </li>
      ))}</ul>}
    </div>
  );
}
