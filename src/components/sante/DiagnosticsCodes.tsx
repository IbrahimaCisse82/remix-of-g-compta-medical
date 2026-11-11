import { useCallback, useEffect, useState } from 'react';
import { HeartPulse, Star, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import RechercheCim10 from './RechercheCim10';
import { chercherCim10Consultation, coderDiagnostic, modeCim10, declarerChronique, lireChroniques, lireDiagnostics, retirerDiagnostic, type DiagnosticCode, type MaladieChronique } from './cim10-client';

/**
 * Codage CIM-10 sous le champ « Diagnostic » : le premier code posé est le diagnostic principal.
 * Le texte libre reste le diagnostic de référence (obligatoire pour clôturer) ; s'il est vide, le premier libellé codé le remplit.
 */
export default function DiagnosticsCodes({ consultationId, patientId, structureId, verrou, diagnosticTexte, onTexte }: {
  consultationId: string; patientId: string; structureId: string; verrou: boolean; diagnosticTexte: string; onTexte: (t: string) => void;
}) {
  const [codes, setCodes] = useState<DiagnosticCode[]>([]);
  const [chroniques, setChroniques] = useState<MaladieChronique[]>([]);
  const [autres, setAutres] = useState(false);
  const [strict, setStrict] = useState(false);
  useEffect(() => { void modeCim10(structureId).then(({ data }) => setStrict(data === 'strict')); }, [structureId]);
  const rechercher = useCallback((q: string) => chercherCim10Consultation(consultationId, q, autres), [consultationId, autres]);
  const charger = useCallback(async () => {
    const [d, c] = await Promise.all([lireDiagnostics('consultation_id', consultationId), lireChroniques(patientId)]);
    setCodes(d); setChroniques(c ?? []);
  }, [consultationId, patientId]);
  useEffect(() => { void charger(); }, [charger]);

  const ajouter = async (code: string, libelle: string) => {
    const { error } = await coderDiagnostic(consultationId, code);
    if (error) return toast.error(error.message);
    if (!diagnosticTexte.trim()) onTexte(`${libelle} (${code})`);
    await charger();
  };
  const principal = async (d: DiagnosticCode) => {
    const { error } = await coderDiagnostic(consultationId, d.code, true);
    if (error) return toast.error(error.message);
    await charger();
  };
  const retirer = async (d: DiagnosticCode) => {
    const { error } = await retirerDiagnostic(d.id);
    if (error) return toast.error(error.message);
    await charger();
  };
  const chronique = async (d: DiagnosticCode) => {
    const { error } = await declarerChronique({ patientId, code: d.code, consultationId });
    if (error) return toast.error(error.message);
    toast.success(`« ${d.libelle} » ajouté aux maladies chroniques du patient`);
    await charger();
  };
  const estChronique = (code: string) => chroniques.some(c => c.code === code && c.statut === 'active');

  return (
    <div className="mt-2 space-y-2">
      {!verrou && <>
        <RechercheCim10 key={String(autres)} rechercher={rechercher} onChoisir={c => void ajouter(c.code, c.libelle)} placeholder={autres ? 'Toute la CIM-10 : code ou mots' : 'Coder en CIM-10 : code ou mots (votre spécialité, symptômes, pathologies fréquentes)'} />
        {!strict && <button type="button" className="text-xs text-primary underline" onClick={() => setAutres(a => !a)}>{autres ? 'Revenir aux codes de ma spécialité' : 'Autre code (hors spécialité)'}</button>}
      </>}
      {codes.length > 0 && (
        <ul className="space-y-1" aria-label="Diagnostics codés">
          {codes.map(d => (
            <li key={d.id} className="flex flex-wrap items-center gap-2 text-sm border border-border rounded-md px-2 py-1">
              <span className="font-mono text-xs text-primary">{d.code}</span>
              <span className="flex-1 min-w-40">{d.libelle}{d.hors_specialite && <span className="ml-2 text-xs text-warning">hors spécialité</span>}</span>
              {d.principal ? <span className="text-xs text-primary flex items-center gap-1"><Star className="h-3 w-3 fill-current" />principal</span>
                : !verrou && <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => principal(d)}><Star className="h-3 w-3" />Principal</Button>}
              {estChronique(d.code) ? <span className="text-xs text-fg2 flex items-center gap-1"><HeartPulse className="h-3 w-3" />chronique</span>
                : <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" title="Ajouter aux maladies chroniques du patient" onClick={() => chronique(d)}><HeartPulse className="h-3 w-3" />Chronique</Button>}
              {!verrou && <Button type="button" size="icon" variant="ghost" className="h-7 w-7" aria-label={`Retirer ${d.code}`} onClick={() => retirer(d)}><X className="h-3 w-3" /></Button>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
