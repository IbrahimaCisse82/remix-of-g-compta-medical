import { useRef, useState } from 'react';
import { Download, Upload, Check } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { fcfa } from '@/domain/sante/tiers-payant';
import { candidatsReglement, lireReleveReglements, validerRapprochements, type FactureRapprochable, type LigneReglement } from '@/lib/reglements-import';

export default function ImportReglements({ structureId, onSaved }: { structureId: string; onSaved: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const pending = useRef(false);
  const [lignes, setLignes] = useState<LigneReglement[]>([]), [factures, setFactures] = useState<FactureRapprochable[]>([]);
  const [selections, setSelections] = useState<string[]>([]), [confirmations, setConfirmations] = useState<boolean[]>([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [resultat, setResultat] = useState('');
  const modele = () => {
    const url = URL.createObjectURL(new Blob(['\uFEFFdate;reference;organisme;facture;montant;mode\n'], {type:'text/csv;charset=utf-8'}));
    const a = document.createElement('a'); a.href=url; a.download='modele-reglements-organismes.csv'; a.click(); URL.revokeObjectURL(url);
  };
  const lire = async (file: File) => {
    if (pending.current) return;
    pending.current=true; setBusy(true); setError(''); setResultat(''); setLignes([]);
    try {
      const rows = lireReleveReglements(await file.text());
      const r = await supabase.rpc('sante_factures_rapprochables', {_structure_id:structureId});
      if (r.error) throw r.error;
      const fs = (r.data ?? []).map(f => ({...f,reste:Number(f.reste)}));
      setFactures(fs); setLignes(rows);
      setSelections(rows.map(l => {const cs=candidatsReglement(l,fs); return cs.length===1 ? cs[0].id : '';}));
      setConfirmations(rows.map(()=>false));
    } catch(e) {setError((e as Error).message);}
    finally {pending.current=false; setBusy(false);}
  };
  let validationError = '';
  if (lignes.length) try {validerRapprochements(lignes,selections,confirmations,factures);} catch(e) {validationError=(e as Error).message;}
  const enregistrer = async () => {
    if (pending.current || !lignes.length || validationError) return;
    pending.current=true; setBusy(true); setError('');
    try {
      const r = await supabase.rpc('sante_importer_reglements', {_structure_id:structureId,_lignes:validerRapprochements(lignes,selections,confirmations,factures)});
      if (r.error) throw r.error;
      const data=r.data as {ajoutes:number;existants:number};
      const message=`${data.ajoutes} règlement(s) enregistré(s) · ${data.existants} déjà importé(s)`;
      setResultat(message); toast.success(message); setLignes([]); onSaved();
    } catch(e) {setError((e as Error).message);}
    finally {pending.current=false;setBusy(false);}
  };
  return <section aria-label="Import des relevés de règlements" className="space-y-4 border-y border-border py-5">
    <div className="flex flex-wrap justify-between gap-3 items-center"><h2 className="font-semibold">Relevés de règlements</h2><div className="flex flex-wrap gap-2">
      <Button variant="outline" onClick={modele} disabled={busy}><Download className="h-4 w-4" />Modèle CSV</Button>
      <Button variant="outline" disabled={busy} onClick={()=>input.current?.click()}><Upload className="h-4 w-4" />Importer un relevé</Button>
      <input ref={input} aria-label="Relevé de règlements CSV" className="hidden" type="file" accept=".csv,.tsv,text/csv" disabled={busy} onChange={e=>{const f=e.target.files?.[0];if(f)void lire(f);e.target.value='';}} />
    </div></div>
    {busy && <p role="status" className="text-sm text-fg3">Traitement du relevé…</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {resultat && <p role="status" className="text-sm text-primary font-semibold">{resultat}</p>}
    {lignes.length>0 && <>
      <div className="flex flex-wrap justify-between gap-2 text-sm"><span>{lignes.length} ligne(s) · {confirmations.filter(Boolean).length} confirmée(s)</span><strong>Total du relevé : {fcfa(lignes.reduce((s,l)=>s+l.montant,0))}</strong></div>
      <div className="overflow-x-auto"><table className="w-full text-sm min-w-[760px]"><thead className="text-left text-fg3 text-xs"><tr><th className="py-2">Date / référence</th><th>Organisme</th><th>Montant</th><th>Facture / reste dû</th><th>Confirmation</th></tr></thead><tbody>{lignes.map((l,i)=>{
        const cs=candidatsReglement(l,factures);
        const compatible=factures.filter(f=>f.organisme.trim().toLocaleLowerCase('fr-FR')===l.organisme.trim().toLocaleLowerCase('fr-FR') && f.reste>=l.montant);
        return <tr key={i} className="border-t border-border align-top"><td className="py-3">{l.date}<span className="block text-xs text-fg3">{l.reference} · {l.mode}</span></td><td className="py-3">{l.organisme}</td><td className="py-3 whitespace-nowrap">{fcfa(l.montant)}</td><td className="py-3 max-w-80">
          <Select value={selections[i]||'aucune'} disabled={busy} onValueChange={v=>{setSelections(a=>a.map((x,j)=>j===i?(v==='aucune'?'':v):x));setConfirmations(a=>a.map((x,j)=>j===i?false:x));}}><SelectTrigger aria-label={`Facture pour la ligne ${i+1}`}><SelectValue placeholder="Choisir une facture" /></SelectTrigger><SelectContent><SelectItem value="aucune">Non rapprochée</SelectItem>{compatible.map(f=><SelectItem key={f.id} value={f.id}>{f.numero} · {fcfa(f.reste)}</SelectItem>)}</SelectContent></Select>
          <span className="block text-xs text-fg3 mt-1">{cs.length===1?'Correspondance proposée':cs.length>1?'Plusieurs correspondances possibles':'Aucune correspondance automatique'}{l.facture?` · Réf. relevé : ${l.facture}`:''}</span>
        </td><td className="py-3"><label className="flex items-center gap-2"><Checkbox aria-label={`Confirmer la ligne ${i+1}`} checked={confirmations[i]??false} disabled={busy||!selections[i]} onCheckedChange={v=>setConfirmations(a=>a.map((x,j)=>j===i?v===true:x))} />Validée</label></td></tr>;
      })}</tbody></table></div>
      {validationError && <p className="text-sm text-destructive">{validationError}</p>}
      <div className="flex flex-wrap gap-2"><Button disabled={busy||!!validationError} onClick={()=>void enregistrer()}><Check className="h-4 w-4" />Enregistrer les correspondances validées</Button><Button variant="ghost" disabled={busy} onClick={()=>{setLignes([]);setError('');}}>Annuler l’import</Button></div>
    </>}
  </section>;
}