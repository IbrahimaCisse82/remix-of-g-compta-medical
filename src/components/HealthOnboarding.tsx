import { useState } from 'react';
import { Building2, Check, FlaskConical, Hospital, Stethoscope } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useApp, type MedicalPalette, type MedicalStructure } from '@/stores/app-store';
import { useMedicalPalette, useTheme } from '@/hooks/use-theme';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type StructureType = MedicalStructure['type'];

const PALETTES: { id: MedicalPalette; label: string; description: string; colors: string[] }[] = [
  { id: 'clinique', label: 'Clinique', description: 'Bleu clinique et turquoise', colors: ['bg-primary', 'bg-accent'] },
  { id: 'laboratoire', label: 'Laboratoire', description: 'Émeraude et cyan technique', colors: ['bg-primary', 'bg-accent'] },
  { id: 'urgences', label: 'Urgences', description: 'Bleu médical et corail d’alerte', colors: ['bg-primary', 'bg-accent'] },
];

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
  const [saving, setSaving] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    const { data, error } = await supabase.rpc('create_medical_structure', {
      _type: type,
      _nom: nom,
      _ninea: ninea || undefined,
      _autorisation_exercice: autorisation || undefined,
      _adresse: adresse || undefined,
      _telephone: telephone || undefined,
      _theme: palette,
    });
    if (error || !data) {
      toast.error(error?.message || 'Création impossible.');
      setSaving(false);
      return;
    }
    // Dossier comptable SYSCOHADA créé et relié automatiquement (best effort, non bloquant).
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (auth.user) {
        const { data: ent } = await supabase.from('entreprises')
          .insert({ nom, user_id: auth.user.id, monnaie: 'FCFA', ninea: ninea || null, adresse: adresse || null })
          .select('id').single();
        if (ent) {
          const secteur = type === 'laboratoire' ? 'sante_laboratoire' : type === 'cabinet' ? 'sante_clinique' : 'sante_mixte';
          await supabase.rpc('set_secteur_activite', { _entreprise_id: ent.id, _secteur: secteur });
          await supabase.rpc('lier_structure_entreprise', { _structure_id: data, _entreprise_id: ent.id });
        }
      }
    } catch { /* la liaison reste possible depuis Structure & équipe */ }
    completeHealthOnboarding({ id: data, nom, type, theme_medical: palette });
    toast.success('Votre structure Santé est prête.');
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
                <Button key={id} type="button" variant={type === id ? 'default' : 'outline'} className="h-20 justify-start" onClick={() => setType(id)}>
                  <Icon /><span>{label}</span>{type === id && <Check className="ml-auto" />}
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