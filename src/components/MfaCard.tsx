import { confirmer as demanderConfirmation } from '@/components/Confirmation';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

type Facteur = { id: string; status: string; friendly_name?: string | null };

/** Enrôlement TOTP. Recommandé (et attendu) pour administrateurs, médecins, biologistes et admin comptable. */
export default function MfaCard() {
  const [facteurs, setFacteurs] = useState<Facteur[]>([]);
  const [enrol, setEnrol] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState('');

  const charger = async () => {
    const { data } = await supabase.auth.mfa.listFactors();
    setFacteurs((data?.totp ?? []) as Facteur[]);
  };
  useEffect(() => { charger(); }, []);

  async function demarrer() {
    // Nettoie un enrôlement inachevé
    for (const f of facteurs.filter(f => f.status !== 'verified')) await supabase.auth.mfa.unenroll({ factorId: f.id });
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `G-Santé ${new Date().toISOString().slice(0, 10)}` });
    if (error || !data) { toast.error('Activation impossible : ' + (error?.message ?? '')); return; }
    setEnrol({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  }
  async function confirmer() {
    if (!enrol) return;
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: enrol.id, code: code.trim() });
    if (error) { toast.error('Code invalide'); return; }
    toast.success('Double authentification activée');
    setEnrol(null); setCode(''); charger();
  }
  async function retirer(id: string) {
    if (!(await demanderConfirmation('Désactiver la double authentification sur ce compte ?'))) return;
    const { error } = await supabase.auth.mfa.unenroll({ factorId: id });
    if (error) toast.error(error.message); else { toast.success('Désactivée'); charger(); }
  }

  const actifs = facteurs.filter(f => f.status === 'verified');
  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div>
        <div className="font-semibold text-foreground">Double authentification (code à 6 chiffres)</div>
        <p className="text-xs text-muted-foreground">Obligatoire pour les administrateurs, médecins, biologistes et administrateurs comptables. Une fois activée, l'accès aux données exige le code à chaque connexion.</p>
      </div>
      {actifs.map(f => (
        <div key={f.id} className="flex items-center justify-between text-sm">
          <span className="text-foreground">✅ {f.friendly_name || 'Application d’authentification'}</span>
          <Button variant="outline" size="sm" onClick={() => retirer(f.id)}>Désactiver</Button>
        </div>
      ))}
      {!actifs.length && !enrol && <Button size="sm" onClick={demarrer}>Activer</Button>}
      {enrol && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Scannez ce code avec Google Authenticator, Microsoft Authenticator ou équivalent, puis saisissez le code affiché.</p>
          <img src={enrol.qr} alt="QR code d'activation" className="h-40 w-40 rounded bg-background p-2" />
          <p className="text-xs text-muted-foreground break-all">Clé manuelle : <code>{enrol.secret}</code></p>
          <div className="flex gap-2">
            <Input inputMode="numeric" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} placeholder="123456" className="w-32" />
            <Button size="sm" onClick={confirmer} disabled={code.length !== 6}>Confirmer</Button>
          </div>
        </div>
      )}
    </div>
  );
}
