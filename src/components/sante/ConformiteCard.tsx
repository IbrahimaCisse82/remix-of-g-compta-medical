import { confirmer } from '@/components/Confirmation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { telecharger } from './BrisGlace';

/** Registre des traitements (modèle à compléter par le responsable juridique). */
const REGISTRE: string[][] = [
  ['Traitement', 'Finalité', 'Base légale', 'Catégories de données', 'Personnes concernées', 'Destinataires', 'Durée de conservation', 'Mesures de sécurité'],
  ['Dossier patient', 'Prise en charge médicale', 'Intérêt vital / mission de soins', 'Identité, antécédents, consultations, ordonnances', 'Patients', 'Médecins en relation de soin', 'Paramétrable (défaut 20 ans, à confirmer)', 'Cloisonnement par structure, accès selon le besoin, double authentification, journal des accès'],
  ['Laboratoire', 'Réalisation et compte rendu d’analyses', 'Mission de soins', 'Demandes, résultats, valeurs critiques', 'Patients', 'Biologistes, techniciens, prescripteur', 'Paramétrable', 'Double validation, rectificatifs versionnés, verrouillage'],
  ['Facturation et tiers-payant', 'Facturation, encaissement, recouvrement', 'Contrat / obligation légale', 'Identité, montants, prise en charge', 'Patients, organismes', 'Caissiers, rôle tiers-payant, administrateur', '10 ans (pièces comptables)', 'Comptabilité sans identité patient ni libellé d’acte'],
  ['Portail patient', 'Mise à disposition des résultats', 'Consentement', 'Comptes rendus validés, ordonnances', 'Patients', 'Le patient', 'Lien 24/48 h, session 24 h', 'Code SMS à usage unique, limitation des essais, journalisation'],
  ['Rappels SMS', 'Rappel de rendez-vous', 'Intérêt légitime / consentement', 'Téléphone, date et heure', 'Patients', 'Prestataire SMS', 'Durée du rendez-vous', 'Aucune donnée médicale dans le message'],
  ['Accès d’urgence', 'Accès exceptionnel hors périmètre', 'Intérêt vital', 'Journal des accès', 'Personnel', 'Administrateurs, responsable protection des données', 'Paramétrable', 'Motif codé, durée 1 h, revue sous 72 h, escalade'],
];

const TYPES = ['defaut', 'compte_rendu', 'imagerie', 'ordonnance', 'courrier', 'autre'];

export default function ConformiteCard({ structureId }: { structureId: string }) {
  const [regles, setRegles] = useState<Record<string, number>>({});

  const load = () => supabase.from('sante_conservation_regles').select('type_document, duree_annees').eq('structure_id', structureId)
    .then(({ data }) => setRegles(Object.fromEntries((data ?? []).map(r => [r.type_document, r.duree_annees]))));
  useEffect(() => { load(); }, [structureId]);

  const enregistrer = async (type: string, annees: number) => {
    const { error } = await supabase.rpc('sante_config_conservation', { _structure_id: structureId, _type: type, _annees: annees });
    if (error) toast.error(error.message); else { toast.success('Durée enregistrée'); load(); }
  };
  const purger = async () => {
    if (!(await confirmer('Supprimer définitivement les documents dont la durée de conservation est échue ? Cette action est tracée.'))) return;
    const { data, error } = await supabase.rpc('sante_purger_documents_echus', { _structure_id: structureId });
    if (error) toast.error(error.message); else toast.success(`${data ?? 0} document(s) purgé(s)`);
  };
  const exporterRegistre = () => telecharger('registre-des-traitements.csv',
    REGISTRE.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(';')).join('\n'));

  return (
    <section className="mt-8 border border-border bg-bg2 rounded-md p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Conformité et protection des données</h3>
        <Button size="sm" variant="outline" onClick={exporterRegistre}>Registre des traitements (CSV)</Button>
      </div>
      <div className="space-y-2">
        <h4 className="text-sm font-semibold">Durée de conservation des documents patients</h4>
        <p className="text-xs text-fg3">Valeur par défaut : 20 ans (à confirmer par votre juriste). La suppression est bloquée avant l'échéance ; après, seule la purge contrôlée ci-dessous supprime.</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {TYPES.map(t => (
            <label key={t} className="flex items-center gap-2 text-sm">
              <span className="w-28">{t === 'defaut' ? 'Par défaut' : t.replace('_', ' ')}</span>
              <Input type="number" min={1} max={100} className="w-20" defaultValue={regles[t] ?? 20} key={`${t}-${regles[t]}`}
                onBlur={e => { const v = Number(e.target.value); if (v && v !== (regles[t] ?? 20)) void enregistrer(t, v); }} />
              <span className="text-xs text-fg3">ans</span>
            </label>
          ))}
        </div>
        <Button size="sm" variant="outline" onClick={purger}>Purger les documents échus</Button>
      </div>
      <div className="border-t border-border pt-3 space-y-1 text-sm">
        <h4 className="font-semibold">Hébergement et sous-traitance</h4>
        <p className="text-xs text-fg3">Informations à compléter par le responsable du traitement.</p>
        <ul className="list-disc pl-5 text-xs space-y-1">
          <li>Hébergement des données : région à confirmer — <i>à compléter</i></li>
          <li>Plateforme applicative et base de données : Lovable Cloud — contact : <i>à compléter</i></li>
          <li>Envoi de SMS : Twilio — aucune donnée médicale transmise — contact : <i>à compléter</i></li>
          <li>Responsable de la protection des données : <i>à compléter</i></li>
          <li>Autorité de contrôle : Commission de protection des Données Personnelles (CDP, Sénégal)</li>
        </ul>
      </div>
    </section>
  );
}
