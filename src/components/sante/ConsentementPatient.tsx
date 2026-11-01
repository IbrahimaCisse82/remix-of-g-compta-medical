import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Eraser, Save } from 'lucide-react';
import { libelleType, modelesEnVigueur, type ModeleConsentement } from '@/domain/sante/consentements-modeles';

export default function ConsentementPatient({ patientId, structureId, onSaved }: { patientId: string; structureId: string; onSaved: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [signed, setSigned] = useState(false);
  const [busy, setBusy] = useState(false);
  const [type, setType] = useState('traitement_donnees');
  const [version, setVersion] = useState('');
  const [texte, setTexte] = useState('');
  const [nom, setNom] = useState('');
  const [qualite, setQualite] = useState('patient');
  const [decision, setDecision] = useState('accord');
  // Bibliothèque : texte validé choisi dans une liste ; saisie libre seulement si la bibliothèque est vide.
  const [modeles, setModeles] = useState<ModeleConsentement[] | null>(null);
  const [modeleId, setModeleId] = useState('');
  const [libre, setLibre] = useState(false);
  useEffect(() => {
    void supabase.from('sante_consentement_modeles')
      .select('id, type, version, titre, texte, texte_sha256, valide_par, actif, created_at, archive_le')
      .eq('structure_id', structureId).eq('actif', true)
      .then(({ data, error }) => {
        const liste = error ? [] : modelesEnVigueur(data ?? []);
        setModeles(liste); setModeleId(liste[0]?.id ?? ''); setLibre(liste.length === 0);
      });
  }, [structureId]);
  const modele = modeles?.find(m => m.id === modeleId);
  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return [(e.clientX - rect.left) * e.currentTarget.width / rect.width, (e.clientY - rect.top) * e.currentTarget.height / rect.height];
  };
  const clear = () => { const c = canvas.current; if (c) c.getContext('2d')?.clearRect(0, 0, c.width, c.height); setSigned(false); };
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !canvas.current || !signed) return toast.error('Signature manuscrite obligatoire.');
    setBusy(true);
    try {
      const png = canvas.current.toDataURL('image/png');
      if (!libre && !modele) throw new Error('Choisissez le texte de consentement à faire signer.');
      const r = !libre && modele
        ? await supabase.rpc('sante_signer_consentement_modele', { _patient_id: patientId, _modele_id: modele.id, _accorde: decision === 'accord', _signataire_nom: nom, _signataire_qualite: qualite, _signature_png: png })
        : await supabase.rpc('sante_signer_consentement', { _patient_id: patientId, _type: type, _version: version, _texte: texte, _accorde: decision === 'accord', _signataire_nom: nom, _signataire_qualite: qualite, _signature_png: png });
      if (r.error) throw r.error;
      toast.success('Consentement enregistré.'); clear(); onSaved();
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Consentement non enregistré. Vérifiez votre accès.'); }
    finally { setBusy(false); }
  };
  return <form onSubmit={save} className="space-y-4 mb-5">
    <h2 className="font-semibold">Recueillir un consentement</h2>
    {modeles === null ? <p className="text-sm text-fg3">Chargement des textes validés…</p> : !libre ? <>
      <div><Label htmlFor="consent-modele">Texte validé à faire signer</Label>
        <Select value={modeleId} onValueChange={setModeleId}><SelectTrigger id="consent-modele"><SelectValue placeholder="Choisir un texte" /></SelectTrigger>
          <SelectContent>{modeles.map(m => <SelectItem key={m.id} value={m.id}>{libelleType(m.type)} · {m.titre} ({m.version})</SelectItem>)}</SelectContent></Select></div>
      {modele && <div className="border border-border rounded-md p-3 bg-background max-h-56 overflow-y-auto"><p className="text-xs text-fg3 mb-1">Texte lu au patient — version {modele.version}{modele.valide_par ? `, validée par ${modele.valide_par}` : ''}</p><p className="text-sm whitespace-pre-wrap">{modele.texte}</p></div>}
    </> : <>
      {modeles.length === 0 && <p className="text-xs text-fg3">Aucun texte enregistré dans la bibliothèque de la structure : saisissez le texte complet. L'administrateur peut l'enregistrer une fois pour toutes dans Paramètres › Bibliothèque des textes de consentement.</p>}
    <div className="grid sm:grid-cols-2 gap-4">
      <div><Label htmlFor="consent-type">Objet</Label><Select value={type} onValueChange={setType}><SelectTrigger id="consent-type"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="traitement_donnees">Traitement des données</SelectItem><SelectItem value="soins">Soins</SelectItem><SelectItem value="partage_tiers_payant">Partage tiers payant</SelectItem></SelectContent></Select></div>
      <div><Label htmlFor="consent-version">Version du texte</Label><Input id="consent-version" value={version} required minLength={2} onChange={e => setVersion(e.target.value)} /></div>
    </div>
    <div><Label htmlFor="consent-text">Texte intégral approuvé par la structure</Label><Textarea id="consent-text" required minLength={50} value={texte} onChange={e => setTexte(e.target.value)} /></div>
    </>}
    {modeles !== null && modeles.length > 0 && <Button type="button" variant="link" className="px-0 h-auto text-xs" onClick={() => setLibre(v => !v)}>{libre ? 'Revenir aux textes de la bibliothèque' : 'Texte absent de la bibliothèque ? Saisir le texte complet'}</Button>}
    <div className="grid sm:grid-cols-2 gap-4">
      <div><Label htmlFor="consent-name">Nom du signataire</Label><Input id="consent-name" required minLength={2} value={nom} onChange={e => setNom(e.target.value)} /></div>
      <div><Label htmlFor="consent-quality">Qualité du signataire</Label><Select value={qualite} onValueChange={setQualite}><SelectTrigger id="consent-quality"><SelectValue /></SelectTrigger><SelectContent>{[['patient','Patient'],['representant_legal','Représentant légal'],['parent','Parent'],['tuteur','Tuteur']].map(([id,label]) => <SelectItem key={id} value={id}>{label}</SelectItem>)}</SelectContent></Select></div>
    </div>
    <div><Label htmlFor="consent-decision">Décision</Label><Select value={decision} onValueChange={setDecision}><SelectTrigger id="consent-decision"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="accord">Accord</SelectItem><SelectItem value="refus">Refus / retrait</SelectItem></SelectContent></Select></div>
    <div className="space-y-2"><Label>Signature manuscrite</Label><canvas ref={canvas} width={640} height={160} aria-label="Signature manuscrite" className="w-full h-40 border border-border rounded-md bg-background touch-none" onPointerDown={e => {
      if (busy) return; drawing.current = true; e.currentTarget.setPointerCapture(e.pointerId);
      const ctx = e.currentTarget.getContext('2d'); if (!ctx) return;
      ctx.strokeStyle = getComputedStyle(e.currentTarget).color; ctx.lineWidth = 2; ctx.lineCap = 'round'; const [x,y] = point(e); ctx.beginPath(); ctx.moveTo(x,y);
    }} onPointerMove={e => { if (!drawing.current) return; const ctx = e.currentTarget.getContext('2d'); if (!ctx) return; const [x,y] = point(e); ctx.lineTo(x,y); ctx.stroke(); setSigned(true); }} onPointerUp={() => { drawing.current = false; }} onPointerCancel={() => { drawing.current = false; }} />
      <Button type="button" variant="ghost" disabled={busy} onClick={clear}><Eraser />Effacer la signature</Button>
    </div>
    <Button type="submit" disabled={busy || !signed}><Save />{busy ? 'Enregistrement…' : 'Enregistrer le consentement'}</Button>
  </form>;
}