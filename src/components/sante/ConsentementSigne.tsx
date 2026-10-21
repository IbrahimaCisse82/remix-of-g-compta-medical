import { useCallback, useEffect, useRef, useState } from 'react';
import { Eraser, FileSignature, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useApp } from '@/stores/app-store';
import { toastErreurSante } from '@/lib/sante-acces';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  MODELES_CONSENTEMENT, QUALITES_SIGNATAIRE, qualiteParDefaut, texteConsentement, verifierSaisieSignature,
  type QualiteSignataire, type TypeConsentement,
} from '@/domain/sante/consentements';

type Patient = { id: string; nom: string; prenoms: string; date_naissance: string | null };

/** Pavé de signature au doigt, au stylet ou à la souris (tablette d'accueil). */
function PaveSignature({ onChange }: { onChange: (png: string | null, traits: number) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const dessin = useRef(false);
  const traits = useRef(0);

  const ctx = () => {
    const c = ref.current!.getContext('2d')!;
    c.lineWidth = 2.5; c.lineCap = 'round'; c.lineJoin = 'round';
    c.strokeStyle = '#0f172a';
    return c;
  };
  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (ref.current!.width / r.width), y: (e.clientY - r.top) * (ref.current!.height / r.height) };
  };
  const effacer = useCallback(() => {
    const c = ref.current; if (!c) return;
    const g = c.getContext('2d')!;
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height);
    traits.current = 0; onChange(null, 0);
  }, [onChange]);
  useEffect(() => { effacer(); }, [effacer]);

  return (
    <div>
      <canvas
        ref={ref} width={640} height={200} aria-label="Zone de signature"
        className="w-full h-40 rounded-md border border-border bg-white touch-none cursor-crosshair"
        onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); dessin.current = true; const p = point(e); const c = ctx(); c.beginPath(); c.moveTo(p.x, p.y); }}
        onPointerMove={e => { if (!dessin.current) return; const p = point(e); const c = ctx(); c.lineTo(p.x, p.y); c.stroke(); }}
        onPointerUp={() => { if (!dessin.current) return; dessin.current = false; traits.current += 1; onChange(ref.current!.toDataURL('image/png'), traits.current); }}
        onPointerLeave={() => { if (dessin.current) { dessin.current = false; traits.current += 1; onChange(ref.current!.toDataURL('image/png'), traits.current); } }}
      />
      <div className="flex justify-between mt-1">
        <p className="text-xs text-fg3">Signez dans le cadre blanc.</p>
        <Button type="button" variant="ghost" size="sm" onClick={effacer}><Eraser />Effacer</Button>
      </div>
    </div>
  );
}

export default function ConsentementSigne({ patient, onDone, onCancel }: { patient: Patient; onDone: () => void; onCancel: () => void }) {
  const { medicalStructure } = useApp();
  const [type, setType] = useState<TypeConsentement>('traitement_donnees');
  const [qualite, setQualite] = useState<QualiteSignataire>(qualiteParDefaut(patient.date_naissance));
  const [nom, setNom] = useState(qualiteParDefaut(patient.date_naissance) === 'patient' ? `${patient.prenoms} ${patient.nom}` : '');
  const [lu, setLu] = useState(false);
  const [signature, setSignature] = useState<{ png: string | null; traits: number }>({ png: null, traits: 0 });
  const [envoi, setEnvoi] = useState(false);
  const texteRef = useRef<HTMLDivElement>(null);

  const modele = MODELES_CONSENTEMENT.find(m => m.type === type)!;
  const texte = texteConsentement(type, medicalStructure?.nom ?? '', `${patient.nom} ${patient.prenoms}`);
  const erreurs = verifierSaisieSignature({ signataireNom: nom, qualite, traits: signature.traits, texteLu: lu, dateNaissance: patient.date_naissance });

  // Le texte doit être affiché jusqu'au bout ; un texte court est lu d'office.
  useEffect(() => {
    setLu(false);
    const el = texteRef.current;
    if (el && el.scrollHeight <= el.clientHeight + 4) setLu(true);
  }, [type]);
  const surDefilement = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 8) setLu(true);
  };
  const onSignature = useCallback((png: string | null, traits: number) => setSignature({ png, traits }), []);

  const enregistrer = async (accorde: boolean) => {
    if (erreurs.length) return toast.error(erreurs[0]);
    setEnvoi(true);
    const { error } = await supabase.rpc('sante_signer_consentement', {
      _patient_id: patient.id, _type: type, _version: modele.version, _texte: texte, _accorde: accorde,
      _signataire_nom: nom.trim(), _signataire_qualite: qualite, _signature_png: signature.png!,
    });
    setEnvoi(false);
    if (error) return void toastErreurSante(error, medicalStructure?.id);
    toast.success(accorde ? 'Consentement signé et enregistré.' : 'Refus signé et enregistré.');
    onDone();
  };

  return (
    <div className="border border-border rounded-md p-4 space-y-4 bg-bg2">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold flex items-center gap-2"><FileSignature className="text-primary" />Recueillir un consentement signé</h2>
        <Button variant="ghost" size="sm" onClick={onCancel} aria-label="Fermer"><X /></Button>
      </div>

      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Type de consentement">
        {MODELES_CONSENTEMENT.map(m => (
          <Button key={m.type} type="button" size="sm" role="radio" aria-checked={type === m.type} variant={type === m.type ? 'default' : 'outline'} onClick={() => setType(m.type)}>{m.titre}</Button>
        ))}
      </div>

      <div>
        <p className="text-xs text-fg3 mb-1">{modele.titre} · version {modele.version}</p>
        <div ref={texteRef} onScroll={surDefilement} tabIndex={0} className="max-h-48 overflow-y-auto rounded-md border border-border bg-background p-3 text-sm leading-relaxed whitespace-pre-line">
          {texte}
        </div>
        <p className={`text-xs mt-1 ${lu ? 'text-primary' : 'text-fg3'}`}>{lu ? 'Texte affiché en entier.' : 'Faites défiler le texte jusqu’au bout.'}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="qualite">Signataire</Label>
          <select id="qualite" className="mt-1 w-full h-10 bg-bg3 border border-border rounded-md px-2 text-sm" value={qualite} onChange={e => setQualite(e.target.value as QualiteSignataire)}>
            {QUALITES_SIGNATAIRE.map(q => <option key={q.id} value={q.id}>{q.label}</option>)}
          </select>
        </div>
        <div>
          <Label htmlFor="signataire">Nom et prénom du signataire</Label>
          <Input id="signataire" className="mt-1" value={nom} onChange={e => setNom(e.target.value)} />
        </div>
      </div>

      <PaveSignature onChange={onSignature} />

      {erreurs.length > 0 && <ul className="text-xs text-fg2 list-disc pl-5">{erreurs.map(e => <li key={e}>{e}</li>)}</ul>}

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" disabled={envoi || erreurs.length > 0} onClick={() => enregistrer(false)}>Le signataire refuse</Button>
        <Button disabled={envoi || erreurs.length > 0} onClick={() => enregistrer(true)}><FileSignature />{envoi ? 'Enregistrement…' : 'Le signataire accepte'}</Button>
      </div>
    </div>
  );
}
