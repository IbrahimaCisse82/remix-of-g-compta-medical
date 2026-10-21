import { useState } from 'react';
import { Building2, Check, FlaskConical, Hospital, Stethoscope } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useApp, type MedicalPalette, type MedicalStructure } from '@/stores/app-store';
import { useMedicalPalette, useTheme } from '@/hooks/use-theme';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toastErreurSante } from '@/lib/sante-acces';

type StructureType = MedicalStructure['type'];

const PALETTES: { id: MedicalPalette; label: string; description: string; colors: string[] }[] = [
  { id: 'clinique', label: 'Clinique', description: 'Bleu clinique et turquoise', colors: ['bg-primary', 'bg-accent'] },
  { id: 'laboratoire', label: 'Laboratoire', description: 'Émeraude et cyan technique', colors: ['bg-primary', 'bg-accent'] },
  { id: 'urgences', label: 'Urgences', description: 'Bleu médical et corail d’alerte', colors: ['bg-primary', 'bg-accent'] },
];

type RoleMetier = 'admin_structure' | 'medecin' | 'biologiste' | 'secretaire';

// Doit rester aligné sur sante_creer_structure (migration 0048).
const ROLES_PAR_TYPE: Record<StructureType, { id: RoleMetier; label: string }[]> = {
  cabinet: [
    { id: 'medecin', label: 'Médecin' },
    { id: 'secretaire', label: 'Secrétaire' },
    { id: 'admin_structure', label: 'Administration seule' },
  ],
  laboratoire: [
    { id: 'biologiste', label: 'Biologiste' },
    { id: 'secretaire', label: 'Secrétaire' },
    { id: 'admin_structure', label: 'Administration seule' },
  ],
  mixte: [
    { id: 'medecin', label: 'Médecin' },
    { id: 'biologiste', label: 'Biologiste' },
    { id: 'secretaire', label: 'Secrétaire' },
    { id: 'admin_structure', label: 'Administration seule' },
  ],
};
const ROLE_DEFAUT: Record<StructureType, RoleMetier> = { cabinet: 'medecin', laboratoire: 'biologiste', mixte: 'medecin' };
const MODULES_PAR_TYPE: Record<StructureType, string[]> = {
  cabinet: ['Dossier patient', 'Clinique', 'Tiers-payant'],
  laboratoire: ['Dossier patient', 'Laboratoire', 'Tiers-payant', 'Portail résultats'],
  mixte: ['Dossier patient', 'Clinique', 'Laboratoire', 'Tiers-payant', 'Portail résultats'],
};

export default function HealthOnboarding() {
  const { completeHealthOnboarding, logout } = useApp();
  const { toggle, resolved } = useTheme();
  const { palette, setPalette } = useMedicalPalette();
  const [type, setType] = useState<StructureType>('cabinet');
  const [nom, setNom] = useState('');
  const [ninea, setNinea] = useState('');
  const [autorisation, setAutorisation] = useState('');
  const [adresse, setAdresse] = useState('');
  const [telephone, setTelephone] = useState('');
  const [roleMetier, setRoleMetier] = useState<RoleMetier>(ROLE_DEFAUT.cabinet);
  const [saving, setSaving] = useState(false);

  const rolesDisponibles = ROLES_PAR_TYPE[type];
  const choisirType = (next: StructureType) => {
    setType(next);
    if (!ROLES_PAR_TYPE[next].some(r => r.id === roleMetier)) setRoleMetier(ROLE_DEFAUT[next]);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    // Création atomique côté serveur : structure + administrateur + rôle métier
    // + dossier comptable SYSCOHADA dédié + modules Santé selon le type.
    const { data, error } = await supabase.rpc('sante_creer_structure', {
      _type: type,
      _nom: nom,
      _role_metier: roleMetier,
      _ninea: ninea || undefined,
      _autorisation_exercice: autorisation || undefined,
      _adresse: adresse || undefined,
      _telephone: telephone || undefined,
      _theme: palette,
    });
    if (error || !data) {
      if (error) await toastErreurSante(error); else toast.error('Création impossible.');
      setSaving(false);
      return;
    }
    completeHealthOnboarding({ id: data, nom, type, theme_medical: palette });
    toast.success(`Votre structure Santé est prête : ${MODULES_PAR_TYPE[type].join(', ')} activés.`);
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="h-16 border-b border-border bg-bg2 flex items-center justify-between px-5 sm:px-8">
        <div className="flex items-center gap-3"><Stethoscope className="text-primary" /><span className="font-serif text-xl text-primary">G‑Santé</span></div>
        <div className="flex gap-2"><Button variant="outline" size="sm" onClick={toggle} aria-label="Changer le thème">{resolved === 'dark' ? 'Clair' : 'Sombre'}</Button><Button variant="ghost" size="sm" onClick={logout}>Quitter</Button></div>
      </header>
      <section className="mx-auto max-w-4xl px-5 py-10 sm:py-14">
        <div className="mb-9 max-w-2xl">
          <p className="text-xs font-mono uppercase text-primary mb-2">Configuration sécurisée</p>
          <h1 className="font-serif text-3xl sm:text-4xl mb-3">Créer votre structure de santé</h1>
          <p className="text-sm text-fg2">Ces informations définissent votre espace, ses droits et son identité visuelle.</p>
        </div>
        <form onSubmit={submit} className="space-y-9">
          <fieldset>
            <legend className="text-sm font-semibold mb-3">Type de structure</legend>
            <div className="grid gap-3 sm:grid-cols-3">
              {([
                ['cabinet', 'Cabinet médical', Stethoscope],
                ['laboratoire', 'Laboratoire', FlaskConical],
                ['mixte', 'Structure mixte', Hospital],
              ] as const).map(([id, label, Icon]) => (
                <Button key={id} type="button" variant={type === id ? 'default' : 'outline'} className="h-20 justify-start" onClick={() => choisirType(id)}>
                  <Icon /><span>{label}</span>{type === id && <Check className="ml-auto" />}
                </Button>
              ))}
            </div>
            <p className="text-xs text-fg2 mt-3">Modules activés automatiquement : {MODULES_PAR_TYPE[type].join(' · ')}</p>
          </fieldset>

          <fieldset>
            <legend className="text-sm font-semibold mb-1">Votre rôle dans la structure</legend>
            <p className="text-xs text-fg2 mb-3">Vous serez administrateur de la structure. Choisissez aussi votre métier pour accéder aux écrans de soin ou de laboratoire.</p>
            <div className="grid gap-3 sm:grid-cols-4">
              {rolesDisponibles.map(r => (
                <Button key={r.id} type="button" variant={roleMetier === r.id ? 'default' : 'outline'} className="h-12 justify-start" onClick={() => setRoleMetier(r.id)}>
                  <span>{r.label}</span>{roleMetier === r.id && <Check className="ml-auto" />}
                </Button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-sm font-semibold mb-3">Palette médicale</legend>
            <div className="grid gap-3 sm:grid-cols-3">
              {PALETTES.map(item => (
                <Button key={item.id} type="button" variant={palette === item.id ? 'default' : 'outline'} className="h-auto min-h-20 justify-start py-3" onClick={() => setPalette(item.id)}>
                  <span className="flex gap-1">{item.colors.map((color, index) => <span key={index} className={`h-7 w-3 rounded-sm ${color}`} />)}</span>
                  <span className="text-left"><span className="block font-semibold">{item.label}</span><span className="block text-xs opacity-75 whitespace-normal">{item.description}</span></span>
                </Button>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="sm:col-span-2"><Label htmlFor="nom">Nom de la structure *</Label><Input id="nom" required minLength={2} value={nom} onChange={e => setNom(e.target.value)} placeholder="Centre médical…" className="mt-2" /></div>
            <div><Label htmlFor="ninea">NINEA</Label><Input id="ninea" value={ninea} onChange={e => setNinea(e.target.value)} className="mt-2" /></div>
            <div><Label htmlFor="autorisation">N° d’autorisation d’exercice</Label><Input id="autorisation" value={autorisation} onChange={e => setAutorisation(e.target.value)} className="mt-2" /></div>
            <div><Label htmlFor="telephone">Téléphone</Label><Input id="telephone" value={telephone} onChange={e => setTelephone(e.target.value)} className="mt-2" /></div>
            <div><Label htmlFor="adresse">Adresse</Label><Input id="adresse" value={adresse} onChange={e => setAdresse(e.target.value)} className="mt-2" /></div>
          </div>
          <div className="flex justify-end"><Button type="submit" size="lg" disabled={saving}><Building2 />{saving ? 'Création…' : 'Créer la structure'}</Button></div>
        </form>
      </section>
    </main>
  );
}