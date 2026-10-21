import { useCallback, useEffect, useState } from 'react';
import { FileText, FlaskConical, Printer } from 'lucide-react';
import { toast } from 'sonner';
import { toastErreurSante } from '@/lib/sante-acces';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { STATUTS_DEMANDE, type StatutDemande } from '@/domain/sante/reference';
import { imprimerCertificat, imprimerCompteRendu } from './print-sante';
import { NouvelleDemande } from './LaboratoirePage';

const TYPES = [['autre', 'Certificat médical'], ['aptitude', 'Aptitude'], ['arret_travail', 'Arrêt de travail'], ['repos', 'Repos'], ['constat', 'Constatation']] as const;

/** Certificats médicaux + prescription d'analyses en un clic depuis la consultation. */
export default function CertificatsAnalyses({ consultation }: { consultation: Record<string, any> }) {
  const [certs, setCerts] = useState<any[]>([]);
  const [demandes, setDemandes] = useState<any[]>([]);
  const [type, setType] = useState<string>('autre');
  const [contenu, setContenu] = useState('');
  const [jours, setJours] = useState('');
  const [prescrire, setPrescrire] = useState(false);

  const load = useCallback(async () => {
    const [a, b] = await Promise.all([
      supabase.from('sante_certificats').select('id, numero, type, emis_le').eq('consultation_id', consultation.id).order('emis_le'),
      supabase.from('sante_demandes_labo').select('id, numero, statut').eq('consultation_id', consultation.id).order('created_at'),
    ]);
    setCerts(a.data ?? []); setDemandes(b.data ?? []);
  }, [consultation.id]);
  useEffect(() => { void load(); }, [load]);

  const emettre = async () => {
    const { data, error } = await supabase.rpc('sante_emettre_certificat', { _consultation_id: consultation.id, _type: type, _contenu: contenu, _jours: jours ? Number(jours) : undefined });
    if (error) return void toastErreurSante(error);
    setContenu(''); setJours(''); await load(); imprimerCertificat(data as string);
  };

  return (
    <>
      <section className="border border-border bg-bg2 rounded-md p-4">
        <h2 className="font-semibold mb-3 flex items-center gap-2"><FileText className="h-4 w-4 text-primary" />Certificat médical</h2>
        <div className="flex flex-wrap gap-1 mb-2">{TYPES.map(([k, l]) => <Button key={k} size="sm" variant={type === k ? 'secondary' : 'ghost'} onClick={() => setType(k)}>{l}</Button>)}</div>
        <Textarea placeholder="Constatations / mentions" value={contenu} onChange={e => setContenu(e.target.value)} />
        <div className="flex gap-2 mt-2">{type === 'arret_travail' && <Input className="w-32" inputMode="numeric" placeholder="Jours" aria-label="Jours d'arrêt" value={jours} onChange={e => setJours(e.target.value)} />}<Button size="sm" onClick={emettre} disabled={!contenu.trim()}>Émettre et imprimer</Button></div>
        {certs.map(c => <div key={c.id} className="mt-2 border-t border-border pt-2 text-sm flex justify-between"><span><span className="font-mono text-xs text-primary">{c.numero}</span> · {TYPES.find(t => t[0] === c.type)?.[1]}</span><Button size="sm" variant="ghost" onClick={() => imprimerCertificat(c.id)}><Printer />Imprimer</Button></div>)}
      </section>
      <section className="border border-border bg-bg2 rounded-md p-4">
        <h2 className="font-semibold mb-3 flex items-center gap-2"><FlaskConical className="h-4 w-4 text-primary" />Analyses de laboratoire</h2>
        {prescrire ? <NouvelleDemande structureId={consultation.structure_id} patientId={consultation.patient_id} consultationId={consultation.id} prescripteur={consultation.praticien?.nom} onDone={() => { setPrescrire(false); void load(); }} />
          : <Button size="sm" variant="outline" onClick={() => setPrescrire(true)}>Prescrire des analyses</Button>}
        {demandes.map(d => <div key={d.id} className="mt-2 border-t border-border pt-2 text-sm flex justify-between"><span><span className="font-mono text-xs text-primary">{d.numero}</span> · {STATUTS_DEMANDE[d.statut as StatutDemande]}</span>{d.statut === 'validee' && <Button size="sm" variant="ghost" onClick={() => imprimerCompteRendu(d.id)}><Printer />Résultats</Button>}</div>)}
      </section>
    </>
  );
}
