import { useCallback, useEffect, useState } from 'react';
import { CalendarPlus, X } from 'lucide-react';
import { toast } from 'sonner';
import { saisir } from '@/components/Confirmation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { aujourdhuiDakar, DELAIS_CONTROLE, echeance, estWeekEnd, jourOuvre, jourSemaine, validerControle } from '@/domain/sante/suivi';
import { annulerControle, lireControles, messageErreur, programmerControle, type Controle } from './controles';

const dateFr = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('fr-FR', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

/** Section « Contrôle » de la consultation : le médecin programme la prochaine visite, avec ou sans rendez-vous. */
export default function ControleConsultation({ consultationId, motifParDefaut }: { consultationId: string; motifParDefaut?: string | null }) {
  const jour = aujourdhuiDakar();
  const [controles, setControles] = useState<Controle[]>([]);
  const [date, setDate] = useState('');
  const [heure, setHeure] = useState('');
  const [motif, setMotif] = useState('');
  const [busy, setBusy] = useState(false);

  const charger = useCallback(async () => setControles(await lireControles({ consultationId })), [consultationId]);
  useEffect(() => { void charger(); }, [charger]);

  const programmer = async () => {
    const m = motif.trim() || (motifParDefaut ? `Suivi : ${motifParDefaut}`.slice(0, 300) : '');
    const erreurs = validerControle({ date, heure, motif: m }, jour);
    if (erreurs.length) return toast.error(erreurs[0]);
    setBusy(true);
    try {
      const { error } = await programmerControle({ consultationId, date, heure, motif: m });
      if (error) return toast.error(messageErreur(error));
      toast.success(heure ? `Contrôle programmé et rendez-vous pris le ${dateFr(date)} à ${heure}` : `Contrôle programmé le ${dateFr(date)}`);
      setDate(''); setHeure(''); setMotif('');
      await charger();
    } catch { toast.error('Contrôle non programmé. Vérifiez votre connexion.'); }
    finally { setBusy(false); }
  };

  const annuler = async (k: Controle) => {
    const raison = await saisir('Motif de l’annulation du contrôle :');
    if (!raison || raison.trim().length < 3) return;
    const { error } = await annulerControle(k.id, raison.trim());
    if (error) return toast.error(error.message);
    toast.success(k.rdv_id ? 'Contrôle annulé, rendez-vous libéré' : 'Contrôle annulé');
    await charger();
  };

  return (
    <section className="border border-border bg-bg2 rounded-md p-4" aria-labelledby="titre-controle">
      <h2 id="titre-controle" className="font-semibold mb-1">Contrôle</h2>
      <p className="text-xs text-fg3 mb-3">Le patient apparaît dans « Patients à revoir » de l’agenda. Avec une heure, le rendez-vous est pris chez le même praticien.</p>
      <div className="flex flex-wrap gap-1 mb-2" role="group" aria-label="Délai du contrôle">
        {DELAIS_CONTROLE.map(d => {
          const v = jourOuvre(d.calcul(jour));
          return <Button key={d.libelle} type="button" size="sm" variant={date === v ? 'secondary' : 'outline'} onClick={() => setDate(v)}>{d.libelle}</Button>;
        })}
      </div>
      <div className="grid sm:grid-cols-[10rem_7rem_1fr_auto] gap-2 items-end">
        <div><Label htmlFor="ctl-date" className="text-xs">Date</Label><Input id="ctl-date" type="date" min={jour} value={date} onChange={e => setDate(e.target.value)} /></div>
        <div><Label htmlFor="ctl-heure" className="text-xs">Heure (facultatif)</Label><Input id="ctl-heure" type="time" step={600} value={heure} onChange={e => setHeure(e.target.value)} /></div>
        <div><Label htmlFor="ctl-motif" className="text-xs">Motif</Label><Input id="ctl-motif" maxLength={300} placeholder={motifParDefaut ? `Suivi : ${motifParDefaut}` : 'Ex. contrôle tensionnel, résultats NFS'} value={motif} onChange={e => setMotif(e.target.value)} /></div>
        <Button disabled={busy || !date} onClick={programmer}><CalendarPlus />{busy ? 'Programmation…' : 'Programmer le contrôle'}</Button>
      </div>
      {date && <p className="text-xs text-fg2 mt-2">{dateFr(date)} · {echeance(date, jour).libelle.toLowerCase()}</p>}
      {date && estWeekEnd(date) && <p role="alert" className="text-xs text-warning mt-1">Ce jour est un {jourSemaine(date)} : vérifiez que le cabinet est ouvert, ou choisissez le lundi {dateFr(jourOuvre(date))}.</p>}
      {controles.length > 0 && (
        <ul className="mt-3 space-y-1">
          {controles.map(k => (
            <li key={k.id} className="text-sm border-t border-border pt-2 flex flex-wrap justify-between items-center gap-2">
              <span>
                <strong>{dateFr(k.prevu_le)}</strong> — {k.motif}
                <span className="ml-2 text-xs text-fg3">{k.statut === 'prevu' ? (k.rdv_id ? 'rendez-vous pris' : 'sans rendez-vous') : k.statut === 'realise' ? 'réalisé' : `annulé${k.annule_motif ? ` : ${k.annule_motif}` : ''}`}</span>
              </span>
              {k.statut === 'prevu' && <Button size="sm" variant="ghost" onClick={() => annuler(k)}><X />Annuler</Button>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
