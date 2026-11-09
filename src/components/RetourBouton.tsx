import { useState } from 'react';
import { MessageSquarePlus } from 'lucide-react';
import { toast } from 'sonner';
import { useApp } from '@/stores/app-store';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { rpcPlateforme } from '@/lib/rpc-plateforme';
import { contexteRetour, erreurRetour, libelleStatutRetour, TYPES_RETOUR, type TypeRetour } from '@/lib/backoffice';

type MonRetour = { id: string; created_at: string; type: string; message: string; statut: string; reponse: string | null };

/** Bouton « Signaler / Suggérer » : les structures pilotes envoient leurs retours à l'équipe Grow Hub. */
export default function RetourBouton() {
  const { medicalStructure, currentPage } = useApp();
  const [ouvert, setOuvert] = useState(false);
  const [onglet, setOnglet] = useState<'envoyer' | 'mes'>('envoyer');
  const [type, setType] = useState<TypeRetour>('bug');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [mes, setMes] = useState<MonRetour[] | null>(null);

  async function chargerMes() {
    const { data, error } = await rpcPlateforme<MonRetour[]>('retours_mes');
    if (error) toast.error(error.message); else setMes(data ?? []);
  }
  async function envoyer() {
    const err = erreurRetour(type, message);
    if (err) { toast.error(err); return; }
    setBusy(true);
    const { error } = await rpcPlateforme<string>('retour_envoyer', {
      _type: type, _message: message, _page: currentPage, _structure_id: medicalStructure?.id ?? null,
      _contexte: contexteRetour(navigator, window.screen, import.meta.env.MODE),
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Merci ! Votre retour est transmis à l\'équipe G-Santé.');
    setMessage(''); setOnglet('mes'); chargerMes();
  }

  return (
    <>
      <button type="button" onClick={() => { setOuvert(true); setOnglet('envoyer'); }}
        className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-lg hover:opacity-90 print:hidden"
        aria-label="Signaler un problème ou suggérer une amélioration">
        <MessageSquarePlus className="h-4 w-4" aria-hidden="true" /> Signaler / Suggérer
      </button>
      <Dialog open={ouvert} onOpenChange={setOuvert}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Votre avis sur G-Santé</DialogTitle>
            <DialogDescription>Un problème, une idée, une question : l'équipe lit chaque message et vous répond ici.</DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 border-b border-border text-sm" role="tablist">
            <button type="button" role="tab" aria-selected={onglet === 'envoyer'} onClick={() => setOnglet('envoyer')}
              className={`px-2 py-1.5 ${onglet === 'envoyer' ? 'border-b-2 border-primary font-medium' : 'text-muted-foreground'}`}>Envoyer</button>
            <button type="button" role="tab" aria-selected={onglet === 'mes'} onClick={() => { setOnglet('mes'); chargerMes(); }}
              className={`px-2 py-1.5 ${onglet === 'mes' ? 'border-b-2 border-primary font-medium' : 'text-muted-foreground'}`}>Mes retours</button>
          </div>
          {onglet === 'envoyer' ? (
            <div className="space-y-3">
              <fieldset className="flex flex-wrap gap-2">
                <legend className="sr-only">Type de retour</legend>
                {TYPES_RETOUR.map(t => (
                  <label key={t.id} className={`cursor-pointer rounded-full border px-3 py-1 text-sm ${type === t.id ? 'border-primary bg-primary/10 text-primary' : 'border-border'}`}>
                    <input type="radio" name="type-retour" value={t.id} checked={type === t.id} onChange={() => setType(t.id)} className="sr-only" />{t.libelle}
                  </label>
                ))}
              </fieldset>
              <label className="block text-sm">
                <span className="sr-only">Votre message</span>
                <Textarea rows={6} maxLength={4000} value={message} onChange={e => setMessage(e.target.value)}
                  placeholder={type === 'bug' ? 'Que faisiez-vous, et que s\'est-il passé ?' : type === 'amelioration' ? 'Qu\'est-ce qui vous ferait gagner du temps ?' : 'Votre question'} />
              </label>
              <p className="text-xs text-muted-foreground">N'indiquez aucun nom ni information de patient. La page affichée et votre rôle sont joints automatiquement.</p>
              <div className="flex justify-end"><Button onClick={envoyer} disabled={busy || message.trim().length < 5}>{busy ? 'Envoi…' : 'Envoyer'}</Button></div>
            </div>
          ) : (
            <div className="max-h-80 space-y-2 overflow-y-auto">
              {mes === null && <p role="status" className="text-sm text-muted-foreground">Chargement…</p>}
              {mes?.length === 0 && <p className="text-sm text-muted-foreground">Vous n'avez encore envoyé aucun retour.</p>}
              {mes?.map(r => (
                <div key={r.id} className="rounded border border-border p-2 text-sm">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{new Date(r.created_at).toLocaleDateString('fr-FR')}</span><span>{libelleStatutRetour(r.statut)}</span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap">{r.message}</p>
                  {r.reponse && <p className="mt-2 rounded bg-muted p-2 text-xs"><span className="font-medium">Réponse de l'équipe : </span>{r.reponse}</p>}
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
