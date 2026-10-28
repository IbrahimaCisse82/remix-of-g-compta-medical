import { useState } from 'react';
import { Search, FlaskConical } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { fcfa } from '@/domain/sante/tiers-payant';
import { GRILLES_LABOTEST, rechercherLabotest, type GrilleLabotest } from '@/lib/labotest-catalogue';

export default function LabotestCatalogue() {
  const [query, setQuery] = useState('');
  const [grille, setGrille] = useState<GrilleLabotest>('particulier');
  const rows = rechercherLabotest(query, grille);
  return <section className="space-y-5" aria-label="Catalogue de démonstration Labotest">
    <header className="border-b border-border pb-4">
      <div className="flex items-center gap-3"><FlaskConical className="text-primary" /><h2 className="font-serif text-2xl">Labotest</h2><span className="text-xs text-fg3">Démonstration · lecture seule</span></div>
      <p className="text-sm text-fg3 mt-2">Nomenclature fournie le 28/10/2026 · Prix de démonstration, non validés pour un usage clinique.</p>
    </header>
    <div className="grid gap-4 sm:grid-cols-[1fr_320px]">
      <div><Label htmlFor="labotest-search">Rechercher une analyse</Label><div className="relative mt-1"><Search className="absolute left-3 top-3 h-4 w-4 text-fg3" /><Input id="labotest-search" className="pl-9" placeholder="Nom ou code source" value={query} onChange={e => setQuery(e.target.value)} /></div></div>
      <div><Label htmlFor="labotest-grid">Grille tarifaire</Label><Select value={grille} onValueChange={v => setGrille(v as GrilleLabotest)}><SelectTrigger id="labotest-grid" className="mt-1"><SelectValue /></SelectTrigger><SelectContent>{GRILLES_LABOTEST.map(g => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}</SelectContent></Select></div>
    </div>
    <p className="text-xs text-fg3" role="status">{rows.length} analyse(s) · Prix en FCFA</p>
    <div className="overflow-x-auto border-y border-border"><table className="w-full text-sm" aria-label="Prix Labotest"><thead className="bg-muted text-fg3 text-left"><tr><th className="p-3">Code source</th><th className="p-3">Analyse</th><th className="p-3 text-right">Coefficient B</th><th className="p-3 text-right">Prix</th></tr></thead><tbody>{rows.map(r => <tr key={r.row} className="border-t border-border"><td className="p-3 font-mono text-primary whitespace-nowrap">{r.codeSource || '—'}</td><td className="p-3 min-w-48">{r.libelle}</td><td className="p-3 text-right">{r.coefficientB}</td><td className="p-3 text-right font-semibold whitespace-nowrap">{fcfa(r.prix)}</td></tr>)}{!rows.length && <tr><td colSpan={4} className="p-8 text-center text-fg3">Aucune analyse ne correspond à cette recherche.</td></tr>}</tbody></table></div>
  </section>;
}