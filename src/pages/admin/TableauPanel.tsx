import { useEffect, useState } from 'react';
import { rpcPlateforme } from '@/lib/rpc-plateforme';

type Tableau = {
  structures_reelles: number; structures_test: number; par_type: Record<string, number>; utilisateurs: number; connectes_7j: number;
  admins_sans_double_auth: number; retours_ouverts: number; retours_nouveaux: number; retours_bloquants: number; compta_en_erreur: number;
  activite_7j: { patients: number; consultations: number; demandes_labo: number; factures: number };
};
const TYPES: Record<string, string> = { cabinet: 'cabinets', laboratoire: 'laboratoires', mixte: 'mixtes' };

/** Vue d'ensemble du pilote : comptages seulement, structures de test exclues. */
export default function TableauPanel({ ouvrir }: { ouvrir: (module: string) => void }) {
  const [t, setT] = useState<Tableau | null>(null);
  const [erreur, setErreur] = useState('');
  useEffect(() => {
    rpcPlateforme<Tableau>('plateforme_tableau_bord').then(({ data, error }) => { if (error) setErreur(error.message); else setT(data); });
  }, []);
  if (erreur) return <p role="alert" className="text-sm text-destructive">{erreur}</p>;
  if (!t) return <p role="status" className="text-sm text-muted-foreground">Chargement…</p>;
  const alertes = [
    t.retours_bloquants > 0 && { texte: `${t.retours_bloquants} retour(s) bloquant(s) à traiter`, module: 'retours' },
    t.retours_nouveaux > 0 && { texte: `${t.retours_nouveaux} nouveau(x) retour(s) à trier`, module: 'retours' },
    t.admins_sans_double_auth > 0 && { texte: `${t.admins_sans_double_auth} administrateur(s) de structure sans double authentification`, module: 'clients' },
    t.compta_en_erreur > 0 && { texte: `${t.compta_en_erreur} écriture(s) comptable(s) automatique(s) en erreur`, module: 'clients' },
  ].filter(Boolean) as { texte: string; module: string }[];
  return (
    <section className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl">Tableau de bord</h1>
        <p className="text-sm text-muted-foreground">Structures réelles uniquement ({t.structures_test} structures de test exclues).</p>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Chiffre libelle="Structures" valeur={t.structures_reelles} detail={Object.entries(t.par_type).map(([k, v]) => `${v} ${TYPES[k] ?? k}`).join(' · ') || '—'} />
        <Chiffre libelle="Utilisateurs actifs" valeur={t.utilisateurs} detail={`${t.connectes_7j} connecté(s) ces 7 jours`} />
        <Chiffre libelle="Retours ouverts" valeur={t.retours_ouverts} detail={`${t.retours_nouveaux} nouveau(x)`} />
        <Chiffre libelle="Écritures en erreur" valeur={t.compta_en_erreur} detail="comptabilisation automatique" />
      </div>
      <div>
        <h2 className="mb-2 text-sm font-medium">À traiter</h2>
        {alertes.length ? (
          <ul className="space-y-1">{alertes.map(a => (
            <li key={a.texte}><button type="button" className="text-sm text-primary underline" onClick={() => ouvrir(a.module)}>{a.texte}</button></li>
          ))}</ul>
        ) : <p className="text-sm text-muted-foreground">Rien d'urgent.</p>}
      </div>
      <div>
        <h2 className="mb-2 text-sm font-medium">Activité des 7 derniers jours</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Chiffre libelle="Patients créés" valeur={t.activite_7j.patients} />
          <Chiffre libelle="Consultations" valeur={t.activite_7j.consultations} />
          <Chiffre libelle="Demandes labo" valeur={t.activite_7j.demandes_labo} />
          <Chiffre libelle="Factures" valeur={t.activite_7j.factures} />
        </div>
      </div>
    </section>
  );
}

function Chiffre({ libelle, valeur, detail }: { libelle: string; valeur: number; detail?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-xs text-muted-foreground">{libelle}</div>
      <div className="text-2xl font-semibold tabular-nums">{valeur.toLocaleString('fr-FR')}</div>
      {detail && <div className="text-xs text-muted-foreground">{detail}</div>}
    </div>
  );
}
