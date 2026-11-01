import { useState } from 'react';
import { toast } from 'sonner';
import { useApp } from '@/stores/app-store';
import { exporterEtatsDgid } from '@/lib/export-dgid';
import { imprimerEtatsFinanciers, type EtatPlaquette } from '@/lib/pdf-export';

/** Boutons d'édition des états : PDF sur la contexture de la plaquette, Excel au modèle DGID. */
export default function ExportEtatsFinanciers({ etats }: { etats: EtatPlaquette[] }) {
  const { balance, balanceN1, entreprise, exercice } = useApp();
  const [enCours, setEnCours] = useState(false);
  if (!entreprise || !exercice) return null;
  const donnees = { entreprise, exercice, balance, balanceN1 };

  const excel = async () => {
    setEnCours(true);
    try {
      const provisoire = await exporterEtatsDgid(donnees);
      if (provisoire.length) toast.warning(`Classeur DGID généré en version provisoire (contrôles : ${provisoire.join(', ')}).`);
      else toast.success('Classeur DGID généré.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Export Excel impossible');
    } finally { setEnCours(false); }
  };

  return (
    <>
      <button onClick={() => void imprimerEtatsFinanciers(donnees, etats)} className="px-3 py-1.5 rounded-md text-[11px] font-semibold border border-primary/30 text-primary hover:bg-primary/10">📄 PDF</button>
      <button onClick={excel} disabled={enCours} className="px-3 py-1.5 rounded-md text-[11px] font-semibold border border-primary/30 text-primary hover:bg-primary/10 disabled:opacity-50">{enCours ? '… Excel' : '📊 Excel DGID'}</button>
    </>
  );
}
