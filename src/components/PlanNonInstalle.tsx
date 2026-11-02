import { useState } from 'react';
import { toast } from 'sonner';
import { useApp } from '@/stores/app-store';

/**
 * Encart affiché quand le dossier n'a aucun compte au plan comptable (cas des structures de santé créées côté
 * serveur) : propose d'installer le référentiel SYSCOHADA, ajout seul, sans rien modifier ni supprimer.
 */
export default function PlanNonInstalle({ objet }: { objet: string }) {
  const { plan, demo, installerPlanReference } = useApp();
  const [enCours, setEnCours] = useState(false);
  if (demo || plan.length > 0) return null;
  const installer = async () => {
    setEnCours(true);
    try {
      const n = await installerPlanReference();
      toast.success(`Plan SYSCOHADA installé : ${n.toLocaleString('fr-FR')} comptes ajoutés.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Installation impossible');
    } finally { setEnCours(false); }
  };
  return (
    <div role="status" className="border border-warning/50 bg-warning/10 rounded-lg p-3 text-sm flex flex-wrap items-center justify-between gap-3">
      <span>Le plan comptable SYSCOHADA n’est pas encore installé pour ce dossier : {objet}.</span>
      <button onClick={installer} disabled={enCours} className="px-3 py-1.5 rounded-md text-xs font-semibold bg-primary text-primary-foreground disabled:opacity-50">
        {enCours ? 'Installation…' : 'Installer le plan SYSCOHADA'}
      </button>
    </div>
  );
}
